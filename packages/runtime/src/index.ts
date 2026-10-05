import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { setTimeout as pause } from 'node:timers/promises'
import pino from 'pino'
import { CreateQueueCommand, GetQueueAttributesCommand, SetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs'
import { z } from 'zod'

export { SQSClient } from '@aws-sdk/client-sqs'
export const logger = pino({ redact: ['password', 'token', 'authorization', 'DATABASE_URL', 'LOCALSTACK_AUTH_TOKEN'] })
export const deviceEnvelopeSchema = z.strictObject({
  thingName: z.string().min(1).max(64).regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/),
  machineId: z.string().min(1).max(64).regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/),
  siteId: z.uuid(),
})
export type DeviceEnvelope = z.infer<typeof deviceEnvelopeSchema>

export function assertLocalMqttEndpoint(endpoint: string): void {
  const url = new URL(endpoint)
  if (url.protocol !== 'mqtt:' || !['localhost', '127.0.0.1', 'mosquitto'].includes(url.hostname)) {
    throw new Error('Phase 0 requires a local MQTT broker')
  }
}

export function parseTelemetryTopic(topic: string): DeviceEnvelope {
  const parts = topic.split('/')
  if (parts.length !== 4 || parts[0] !== 'kinetiq' || parts[3] !== 'telemetry') throw new Error('Invalid telemetry topic')
  return deviceEnvelopeSchema.parse({ thingName: parts[2], machineId: parts[2], siteId: parts[1] })
}

// Local services cannot accidentally fall through to real AWS credentials/endpoints.
export function createLocalQueueClient(endpoint: string): SQSClient {
  const url = new URL(endpoint)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', 'localstack'].includes(url.hostname)) {
    throw new Error('Local SQS endpoint must be localhost or the Compose localstack service')
  }
  return new SQSClient({ endpoint, region: 'us-east-1', credentials: { accessKeyId: 'test', secretAccessKey: 'test' }, maxAttempts: 3 })
}

// Local infrastructure bootstrap only; production queues belong to CDK.
export async function ensureLocalQueues(client: SQSClient, name = 'kinetiq-telemetry') {
  const dlq = await client.send(new CreateQueueCommand({ QueueName: `${name}-dlq`, Attributes: { MessageRetentionPeriod: '604800' } }))
  const queue = await client.send(new CreateQueueCommand({ QueueName: name, Attributes: {
    VisibilityTimeout: '90', ReceiveMessageWaitTimeSeconds: '20', MessageRetentionPeriod: '604800',
  } }))
  if (!queue.QueueUrl || !dlq.QueueUrl) throw new Error('Queue URL missing from bootstrap result')
  const dead = await client.send(new GetQueueAttributesCommand({ QueueUrl: dlq.QueueUrl, AttributeNames: ['QueueArn'] }))
  const inbox = await client.send(new GetQueueAttributesCommand({ QueueUrl: queue.QueueUrl, AttributeNames: ['QueueArn'] }))
  await client.send(new SetQueueAttributesCommand({ QueueUrl: queue.QueueUrl, Attributes: {
    RedrivePolicy: JSON.stringify({ deadLetterTargetArn: dead.Attributes?.QueueArn, maxReceiveCount: '5' }),
  } }))
  await client.send(new SetQueueAttributesCommand({ QueueUrl: dlq.QueueUrl, Attributes: {
    RedriveAllowPolicy: JSON.stringify({ redrivePermission: 'byQueue', sourceQueueArns: [inbox.Attributes?.QueueArn] }),
  } }))
  return { queueUrl: queue.QueueUrl, deadLetterQueueUrl: dlq.QueueUrl }
}

export function requiredEnv(name: string): string {
  const file = process.env[`${name}_FILE`]
  const value = (file ? readFileSync(file, 'utf8') : process.env[name])?.trim()
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}
export function integerEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}: expected integer ${min}..${max}`)
  return value
}
export function stopSignal(): AbortController {
  const controller = new AbortController()
  process.once('SIGTERM', () => controller.abort())
  process.once('SIGINT', () => controller.abort())
  return controller
}
export async function untilStopped<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('Stopping')
  let stop: (() => void) | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      stop = () => reject(new Error('Stopping'))
      signal.addEventListener('abort', stop, { once: true })
    })])
  } finally { if (stop) signal.removeEventListener('abort', stop) }
}
export async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  try { await pause(ms, undefined, signal ? { signal } : undefined) }
  catch (error) { if (!signal?.aborted) throw error }
}
export function serveHealth(ready: () => boolean, port = 8080) {
  const server = createServer((request, response) => {
    if (!['/health/live', '/health/ready'].includes(request.url ?? '')) { response.writeHead(404).end(); return }
    const healthy = request.url === '/health/live' || ready()
    response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify({ status: healthy ? 'ok' : 'unavailable' }))
  })
  server.listen(port, '0.0.0.0')
  return async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
}

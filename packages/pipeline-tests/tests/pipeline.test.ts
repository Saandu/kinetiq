import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { connectAsync, type MqttClient } from 'mqtt'
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import { ChangeMessageVisibilityCommand, ReceiveMessageCommand, SendMessageCommand, type Message } from '@aws-sdk/client-sqs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createLocalQueueClient, ensureLocalQueues, type DeviceEnvelope, type SQSClient } from '@kinetiq/runtime'
import { createServicePool, insertTelemetryBatch, migrate, resolveDevice, seed } from '@kinetiq/db'
import { simulationFleet } from '@kinetiq/contracts'
import { makeBatch } from '@kinetiq/simulator'
import { startBridge } from '@kinetiq/local-bridge'
import { processMessage } from '@kinetiq/ingest'

const rootEnv = fileURLToPath(new URL('../../../.env.local', import.meta.url))
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)
const site = '11111111-1111-4111-8111-111111111112'
const fleet = simulationFleet()
const password = randomBytes(24).toString('hex')
const containers: StartedTestContainer[] = []
const clients: MqttClient[] = []
const pools: Pool[] = []
let queue: SQSClient
let queueUrl: string
let deadLetterQueueUrl: string
let mqttUrl: string
let admin: Pool
let ingest: Pool
let bridge: MqttClient

beforeAll(async () => {
  const token = process.env.LOCALSTACK_AUTH_TOKEN?.trim()
  if (!token) throw new Error('Set LOCALSTACK_AUTH_TOKEN in the root .env.local or CI environment; this test is never silently skipped')
  const localstack = await new GenericContainer('localstack/localstack:2026.09.0@sha256:801a3dff7f6a23857e7310b7602e67d52a29dfdcb03e09f7c608d5c57d24b792')
    .withEnvironment({ LOCALSTACK_AUTH_TOKEN: token, SERVICES: 'sqs', SQS_ENDPOINT_STRATEGY: 'dynamic', AWS_DEFAULT_REGION: 'us-east-1' })
    .withExposedPorts(4566).withWaitStrategy(Wait.forHttp('/_localstack/health', 4566)).withStartupTimeout(120_000).start()
  containers.push(localstack)
  queue = createLocalQueueClient(`http://127.0.0.1:${localstack.getMappedPort(4566)}`)
  ;({ queueUrl, deadLetterQueueUrl } = await ensureLocalQueues(queue))
  const config = `listener 1883\nallow_anonymous false\npassword_file /tmp/passwords\nacl_file /tmp/acl\npersistence true\npersistence_location /mosquitto/data/\nmax_packet_size 8192\nmessage_size_limit 5120\nmax_queued_messages 10000\nlog_dest stdout\n`
  const acl = ['user bridge\ntopic read kinetiq/+/+/telemetry', ...fleet.map((device) => `user ${device.id}\ntopic write kinetiq/${site}/${device.id}/telemetry`)].join('\n') + '\n'
  const broker = await new GenericContainer('eclipse-mosquitto:2.1.2-alpine@sha256:38c0da4f2ef84284d47b3b3eeea1cb3bdeabe81ee10caf0cd5c5ff61ee3ea408')
    .withEnvironment({ MQTT_PASSWORD: password })
    .withCopyContentToContainer([{ content: config, target: '/tmp/mosquitto.conf' }, { content: acl, target: '/tmp/acl' }])
    .withEntrypoint(['/bin/sh', '-ec']).withCommand([
      `mosquitto_passwd -b -c /tmp/passwords bridge "$MQTT_PASSWORD"\n` +
      fleet.map((device) => `mosquitto_passwd -b /tmp/passwords ${device.id} "$MQTT_PASSWORD"`).join('\n') +
      '\nchown mosquitto:mosquitto /tmp/passwords /tmp/acl\nchmod 600 /tmp/passwords /tmp/acl\nexec mosquitto -c /tmp/mosquitto.conf',
    ]).withExposedPorts(1883).withWaitStrategy(Wait.forLogMessage(/mosquitto version .* running/)).start()
  containers.push(broker)
  mqttUrl = `mqtt://127.0.0.1:${broker.getMappedPort(1883)}`
  bridge = await startBridge({ mqttUrl, username: 'bridge', password, queueUrl }, queue); clients.push(bridge)
  const postgres = await new PostgreSqlContainer('kinetiq-postgres:18.6-1').withDatabase('kinetiq')
    .withUsername('postgres').withPassword(randomBytes(24).toString('hex')).start()
  containers.push(postgres)
  admin = new Pool({ connectionString: postgres.getConnectionUri(), max: 2 }); pools.push(admin)
  await migrate(admin); await seed(admin, 12)
  await admin.query(`ALTER ROLE kinetiq_ingest LOGIN PASSWORD '${password}'`)
  const uri = new URL(postgres.getConnectionUri()); uri.username = 'kinetiq_ingest'; uri.password = password
  ingest = createServicePool('ingest', { connectionString: uri.toString() }); pools.push(ingest)
}, 180_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await Promise.allSettled(clients.map((client) => client.endAsync(true)))
  queue?.destroy()
  await Promise.allSettled(pools.map((pool) => pool.end()))
  await Promise.allSettled(containers.map((container) => container.stop()))
}, 30_000)

async function receive(url = queueUrl, timeout = 10): Promise<Message> {
  const response = await queue.send(new ReceiveMessageCommand({ QueueUrl: url, WaitTimeSeconds: timeout,
    VisibilityTimeout: 90, MessageAttributeNames: ['All'], MessageSystemAttributeNames: ['ApproximateReceiveCount'],
  }))
  if (!response.Messages?.[0]) throw new Error('Expected a queue message')
  return response.Messages[0]
}
async function release(message: Message) {
  await queue.send(new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle!, VisibilityTimeout: 0 }))
}
async function device(id: string) {
  const client = await connectAsync(mqttUrl, { clientId: id, username: id, password, protocolVersion: 5, reconnectPeriod: 0 })
  clients.push(client); return client
}
const consumer = () => ({ queue, queueUrl, signal: new AbortController().signal,
  persist: async (envelope: DeviceEnvelope, batch: ReturnType<typeof makeBatch>) => insertTelemetryBatch(ingest, await resolveDevice(ingest, envelope), batch),
})
async function rows(id: string) { return Number((await admin.query('SELECT count(*) FROM kinetiq.telemetry WHERE machine_id=$1', [id])).rows[0].count) }

describe('authenticated MQTT → real SQS emulator → PostgreSQL', () => {
  it('persists all twelve device batches through the complete transport path', async () => {
    for (const { id } of fleet) {
      const client = await device(id)
      await client.publishAsync(`kinetiq/${site}/${id}/telemetry`, JSON.stringify(makeBatch(id, Date.now(), 1)), { qos: 1 })
      expect(await processMessage(consumer(), await receive())).toBe('committed')
      expect(await rows(id)).toBe(6)
    }
  }, 30_000)
  it('keeps a database-failed batch, then commits safely when it is redelivered twice', async () => {
    const id = fleet[0]!.id
    const batch = makeBatch(id, Date.now() + 60_000, 2)
    const client = clients.find((client) => client.options.clientId === id)!
    await client.publishAsync(`kinetiq/${site}/${id}/telemetry`, JSON.stringify(batch), { qos: 1 })
    const message = await receive()
    await admin.query('REVOKE INSERT ON kinetiq.telemetry FROM kinetiq_ingest')
    try { expect(await processMessage(consumer(), message)).toBe('retry'); expect(await rows(id)).toBe(6) }
    finally { await admin.query('GRANT INSERT ON kinetiq.telemetry TO kinetiq_ingest') }
    await release(message)
    expect(await processMessage(consumer(), await receive())).toBe('committed')
    await queue.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: message.Body!, MessageAttributes: message.MessageAttributes! }))
    expect(await processMessage(consumer(), await receive())).toBe('committed')
    expect(await rows(id)).toBe(12)
  }, 30_000)
  it('redelivers the durable MQTT subscription after a failed SQS handoff', async () => {
    const send = queue.send.bind(queue)
    let failed = false
    const spy = vi.spyOn(queue, 'send').mockImplementation((...args: Parameters<typeof send>) => {
      if (args[0] instanceof SendMessageCommand && !failed) { failed = true; return Promise.reject(new Error('Injected handoff failure')) }
      return send(...args)
    })
    try {
      const id = fleet[1]!.id
      const client = clients.find((client) => client.options.clientId === id)!
      await client.publishAsync(`kinetiq/${site}/${id}/telemetry`, JSON.stringify(makeBatch(id, Date.now() + 60_000, 2)), { qos: 1 })
      const message = await receive()
      expect(failed).toBe(true)
      expect(await processMessage(consumer(), message)).toBe('committed')
      expect(await rows(id)).toBe(12)
    } finally { spy.mockRestore() }
  }, 30_000)
  it('denies a device publishing another device’s topic at the broker', async () => {
    const client = clients.find((client) => client.options.clientId === fleet[0]!.id)!
    await expect(client.publishAsync(`kinetiq/${site}/${fleet[1]!.id}/telemetry`, '{}', { qos: 1 })).rejects.toThrow()
    const result = await queue.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }))
    expect(result.Messages ?? []).toHaveLength(0)
  })
  it('moves a poison message to the dead-letter queue after five failed deliveries', async () => {
    await queue.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: 'malformed-json', MessageAttributes: {
      thingName: { DataType: 'String', StringValue: fleet[0]!.id }, machineId: { DataType: 'String', StringValue: fleet[0]!.id },
      siteId: { DataType: 'String', StringValue: site },
    } }))
    for (let delivery = 1; delivery <= 5; delivery++) {
      const message = await receive()
      expect(Number(message.Attributes?.ApproximateReceiveCount)).toBe(delivery)
      expect(await processMessage(consumer(), message)).toBe('retry')
      await release(message)
    }
    // A receive triggers redrive; the inbox then becomes empty.
    const inbox = await queue.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }))
    expect(inbox.Messages ?? []).toHaveLength(0)
    expect((await receive(deadLetterQueueUrl)).Body).toBe('malformed-json')
  }, 30_000)
})

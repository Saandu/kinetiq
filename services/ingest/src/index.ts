import { ChangeMessageVisibilityCommand, DeleteMessageCommand, ReceiveMessageCommand, type Message } from '@aws-sdk/client-sqs'
import { parseTelemetryMessage, type TelemetryBatch } from '@kinetiq/contracts'
import { deviceEnvelopeSchema, logger, wait, type DeviceEnvelope, type SQSClient } from '@kinetiq/runtime'

export interface ConsumerConfig {
  queue: SQSClient; queueUrl: string; signal: AbortSignal;
  persist: (envelope: DeviceEnvelope, batch: TelemetryBatch) => Promise<number>;
  onPolling?: (healthy: boolean) => void;
}

export async function processMessage(config: ConsumerConfig, message: Message): Promise<'committed' | 'retry'> {
  if (!message.ReceiptHandle || !message.Body) return 'retry'
  const receipt = message.ReceiptHandle
  let refreshing = false
  let heartbeat: Promise<unknown> | undefined
  const lease = setInterval(() => {
    if (refreshing) return
    refreshing = true
    heartbeat = config.queue.send(new ChangeMessageVisibilityCommand({ QueueUrl: config.queueUrl, ReceiptHandle: receipt, VisibilityTimeout: 90 }),
      { abortSignal: AbortSignal.timeout(15_000) })
      .catch(() => logger.warn({ messageId: message.MessageId }, 'Visibility extension failed; redelivery remains possible'))
      .finally(() => { refreshing = false })
  }, 30_000)
  lease.unref()
  try {
    const envelope = deviceEnvelopeSchema.parse(Object.fromEntries(['thingName', 'machineId', 'siteId'].map((name) => [name, message.MessageAttributes?.[name]?.StringValue])))
    const batch = parseTelemetryMessage(message.Body)
    if (batch.machineId !== envelope.machineId) throw new Error('Payload identity does not match queue envelope')
    const inserted = await config.persist(envelope, batch)
    // Commit must precede acknowledgement; failure here permits safe redelivery.
    await config.queue.send(new DeleteMessageCommand({ QueueUrl: config.queueUrl, ReceiptHandle: receipt }), { abortSignal: AbortSignal.timeout(15_000) })
    logger.info({ messageId: message.MessageId, machineId: envelope.machineId, inserted }, 'Telemetry batch committed and acknowledged')
    return 'committed'
  } catch (error) {
    logger.warn({ messageId: message.MessageId, error: error instanceof Error ? error.name : 'unknown' }, 'Message retained for retry or dead-letter redrive')
    return 'retry'
  } finally { clearInterval(lease); await heartbeat }
}

export async function runConsumer(config: ConsumerConfig): Promise<void> {
  let failureDelay = 1000
  while (!config.signal.aborted) {
    try {
      const response = await config.queue.send(new ReceiveMessageCommand({ QueueUrl: config.queueUrl,
        MaxNumberOfMessages: 3, WaitTimeSeconds: 20, VisibilityTimeout: 90, MessageAttributeNames: ['All'], MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }), { abortSignal: AbortSignal.any([config.signal, AbortSignal.timeout(25_000)]) })
      failureDelay = 1000; config.onPolling?.(true)
      // Three messages match the ingest pool budget. Shutdown finishes this group.
      await Promise.all((response.Messages ?? []).map((message) => processMessage(config, message)))
    } catch {
      if (config.signal.aborted) break
      config.onPolling?.(false)
      logger.warn({ retryMs: failureDelay }, 'Queue polling failed')
      await wait(failureDelay, config.signal)
      failureDelay = Math.min(failureDelay * 2, 30_000)
    }
  }
}

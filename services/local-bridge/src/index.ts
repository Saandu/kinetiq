import { connect, type MqttClient } from 'mqtt'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { MAX_TELEMETRY_BYTES } from '@kinetiq/contracts'
import { assertLocalMqttEndpoint, logger, parseTelemetryTopic, type SQSClient } from '@kinetiq/runtime'

export interface BridgeConfig { mqttUrl: string; username: string; password: string; queueUrl: string }

export async function startBridge(config: BridgeConfig, queue: SQSClient): Promise<MqttClient> {
  assertLocalMqttEndpoint(config.mqttUrl)
  const client = connect(config.mqttUrl, {
    clientId: 'kinetiq-local-bridge', username: config.username, password: config.password,
    clean: false, protocolVersion: 5, properties: { sessionExpiryInterval: 86400 }, reconnectPeriod: 1000, connectTimeout: 10_000, manualConnect: true,
  })
  client.on('error', () => logger.warn({ service: 'local-bridge' }, 'MQTT connection error'))
  // MQTT.js calls this before acknowledging QoS 1. SQS must accept the body first.
  client.handleMessage = (packet, callback) => {
    let envelope: ReturnType<typeof parseTelemetryTopic>
    const payload = Buffer.isBuffer(packet.payload) ? packet.payload : Buffer.from(packet.payload)
    try {
      if (payload.byteLength > MAX_TELEMETRY_BYTES) throw new Error('MQTT payload too large')
      envelope = parseTelemetryTopic(packet.topic)
    } catch {
      logger.warn({ service: 'local-bridge' }, 'Rejected invalid MQTT transport envelope')
      callback(); return
    }
    void (async () => {
      await queue.send(new SendMessageCommand({
        QueueUrl: config.queueUrl, MessageBody: payload.toString('utf8'),
        MessageAttributes: Object.fromEntries(Object.entries(envelope).map(([name, value]) => [name, { DataType: 'String', StringValue: value }])),
      }), { abortSignal: AbortSignal.timeout(15_000) })
      callback()
    })().catch((error: unknown) => {
      logger.warn({ service: 'local-bridge', error: error instanceof Error ? error.name : 'unknown' }, 'Queue handoff failed; MQTT message remains unacknowledged')
      callback(error instanceof Error ? error : new Error('Queue handoff failed'))
      // Reconnect with the same durable session so the broker can redeliver.
      client.stream.destroy()
    })
  }
  // Install the acknowledgement hook before a durable session can deliver backlog.
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => { client.off('connect', connected); reject(error) }
    const connected = () => { client.off('error', failed); resolve() }
    client.once('error', failed); client.once('connect', connected); client.connect()
  }).catch(async (error: unknown) => { await client.endAsync(true); throw error })
  await client.subscribeAsync('kinetiq/+/+/telemetry', { qos: 1 })
  return client
}

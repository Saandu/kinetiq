import { performance } from 'node:perf_hooks'
import { connectAsync, type MqttClient } from 'mqtt'
import { assertLocalMqttEndpoint, deviceEnvelopeSchema, integerEnv, logger, requiredEnv, serveHealth, stopSignal, untilStopped, wait } from '@kinetiq/runtime'
import { makeBatch, PublishRateLimit, simulationFleet } from './index.js'

const count = integerEnv('DEVICE_COUNT', 12, 1, 500)
const period = integerEnv('PUBLISH_MS', 60_000, 10_000, 3_600_000)
const mqttUrl = requiredEnv('MQTT_URL')
assertLocalMqttEndpoint(mqttUrl)
const siteId = requiredEnv('SITE_ID')
deviceEnvelopeSchema.parse({ siteId, thingName: 'DEMO-CNC-01', machineId: 'DEMO-CNC-01' })
const password = requiredEnv('MQTT_DEVICE_PASSWORD')
const stop = stopSignal()
const devices: { machine: ReturnType<typeof simulationFleet>[number]; client: MqttClient; limiter: PublishRateLimit; seq: number }[] = []
try {
  for (const machine of simulationFleet(count)) {
    const client = await connectAsync(mqttUrl, { clientId: machine.id, username: machine.id, password,
      clean: false, protocolVersion: 5, properties: { sessionExpiryInterval: 86400 }, reconnectPeriod: 1000, connectTimeout: 10_000 })
    client.on('error', () => logger.warn({ machineId: machine.id }, 'MQTT connection error'))
    devices.push({ machine, client, limiter: new PublishRateLimit(), seq: 0 })
  }
  const closeHealth = serveHealth(() => devices.every((device) => device.client.connected))
  try {
    while (!stop.signal.aborted) {
      await Promise.all(devices.map(async (device) => {
        if (!device.client.connected || !device.limiter.take(performance.now())) return
        const batch = makeBatch(device.machine.id, Date.now(), ++device.seq)
        try { await untilStopped(device.client.publishAsync(`kinetiq/${siteId}/${device.machine.id}/telemetry`, JSON.stringify(batch), { qos: 1 }), stop.signal) }
        catch { logger.warn({ machineId: device.machine.id }, 'Publish failed; durable MQTT session may redeliver') }
      }))
      await wait(period, stop.signal)
    }
  } finally { await closeHealth() }
} finally { await Promise.allSettled(devices.map((device) => device.client.endAsync(true))) }

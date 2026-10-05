import { createLocalQueueClient, requiredEnv, serveHealth, stopSignal, wait } from '@kinetiq/runtime'
import { startBridge } from './index.js'

const stop = stopSignal()
const queue = createLocalQueueClient(requiredEnv('SQS_ENDPOINT'))
const bridge = await startBridge({ mqttUrl: requiredEnv('MQTT_URL'), username: 'bridge', password: requiredEnv('MQTT_BRIDGE_PASSWORD'), queueUrl: requiredEnv('SQS_QUEUE_URL') }, queue)
const closeHealth = serveHealth(() => bridge.connected)
try { while (!stop.signal.aborted) await wait(1000, stop.signal) }
finally { await closeHealth(); await bridge.endAsync(false); queue.destroy() }

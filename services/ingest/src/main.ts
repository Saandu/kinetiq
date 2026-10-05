import { createServicePool, insertTelemetryBatch, InvalidDeviceMapping, resolveDevice } from '@kinetiq/db'
import { createLocalQueueClient, requiredEnv, serveHealth, stopSignal } from '@kinetiq/runtime'
import { runConsumer } from './index.js'

const pool = createServicePool('ingest', { connectionString: requiredEnv('DATABASE_URL') })
await pool.query('SELECT 1')
const queue = createLocalQueueClient(requiredEnv('SQS_ENDPOINT'))
const stop = stopSignal()
let queueHealthy = false
let databaseHealthy = true
const closeHealth = serveHealth(() => !stop.signal.aborted && queueHealthy && databaseHealthy)
try {
  await runConsumer({ queue, queueUrl: requiredEnv('SQS_QUEUE_URL'), signal: stop.signal,
    onPolling: (healthy) => { queueHealthy = healthy },
    persist: async (envelope, batch) => {
      try {
        const device = await resolveDevice(pool, envelope)
        const inserted = await insertTelemetryBatch(pool, device, batch)
        databaseHealthy = true; return inserted
      } catch (error) { if (!(error instanceof InvalidDeviceMapping)) databaseHealthy = false; throw error }
    },
  })
} finally { await closeHealth(); queue.destroy(); await pool.end() }

import { createServicePool } from '@kinetiq/db'
import { databaseTls, integerEnv, logger, requiredEnv, stopSignal } from '@kinetiq/runtime'
import { buildApi } from './index.js'

if (requiredEnv('API_MODE') !== 'local-readonly') throw new Error('Only explicit local-readonly API mode is available in Phase 0')
const connectionString = requiredEnv('DATABASE_URL')
if (!['localhost', '127.0.0.1', 'postgres'].includes(new URL(connectionString).hostname)) throw new Error('Phase 0 API requires a local database')
const pool = createServicePool('api', { connectionString, ssl: databaseTls(connectionString) })
pool.on('error', () => logger.error({ service: 'api' }, 'Idle database connection failed'))
const stop = stopSignal()
const app = await buildApi({ pool, demoOrganizationId: requiredEnv('DEMO_ORGANIZATION_ID'), logging: true, closePool: true })
stop.signal.addEventListener('abort', () => { void app.close() }, { once: true })
await app.listen({ host: '0.0.0.0', port: integerEnv('PORT', 8080, 1, 65535) })

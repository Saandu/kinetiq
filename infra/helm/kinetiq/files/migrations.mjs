import { Pool } from 'pg'
import { migrate, seed } from '@kinetiq/db'
import { databaseTls, requiredEnv } from '@kinetiq/runtime'
import { readFile } from 'node:fs/promises'

const url = new URL(requiredEnv('DATABASE_URL'))
if (url.hostname !== 'postgres' || url.pathname !== '/kinetiq') throw new Error('Local migration target must be postgres/kinetiq')
if (process.env.DATABASE_CONNECT_HOST) {
  if (process.env.DATABASE_CONNECT_HOST !== 'kinetiq-db-rw.kinetiq-local.svc.cluster.local') throw new Error('Unexpected bootstrap database host')
  url.hostname = process.env.DATABASE_CONNECT_HOST
}
const pool = new Pool({ connectionString: url.href, ssl: databaseTls(url.href), max: 1, connectionTimeoutMillis: 5000 })
try {
  // Expand/contract only: old application Pods may still serve during a migration.
  await migrate(pool)
  await seed(pool, 12)
  for (const role of ['api', 'ingest']) {
    const password = (await readFile(`/secrets/${role}/password`, 'utf8')).trim()
    if (!/^[a-f0-9]{64}$/.test(password)) throw new Error('Expected generated local password')
    await pool.query(`ALTER ROLE kinetiq_${role} LOGIN PASSWORD '${password}'`)
  }
  console.log('Migrations, local seed and restricted service identities ready')
} finally { await pool.end() }

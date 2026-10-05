import { readFile, writeFile } from 'node:fs/promises'
import { Pool } from 'pg'
import { migrate, seed } from '@kinetiq/db'
import { createLocalQueueClient, ensureLocalQueues } from '@kinetiq/runtime'

const password = async (area) => {
  const value = await readFile(`/secrets/${area}/password`, 'utf8')
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid local credential file')
  return value
}
const pool = new Pool({ host: 'postgres', database: 'kinetiq', user: 'postgres', password: await password('admin'), max: 1 })
const queue = createLocalQueueClient('http://localstack:4566')
try {
  await migrate(pool)
  await seed(pool, 12)
  for (const role of ['api', 'ingest']) {
    const value = await password(role)
    // Both role and password are restricted above; SQL utility statements cannot bind PASSWORD.
    await pool.query(`ALTER ROLE kinetiq_${role} LOGIN PASSWORD '${value}'`)
    await writeFile(`/secrets/${role}/url`, `postgresql://kinetiq_${role}:${value}@postgres:5432/kinetiq`, { mode: 0o600 })
  }
  const queues = await ensureLocalQueues(queue)
  await writeFile('/secrets/queue/url', queues.queueUrl, { mode: 0o644 })
  console.log('Migrations, 12 registered devices, restricted database identities and local queues ready')
} finally { queue.destroy(); await pool.end() }

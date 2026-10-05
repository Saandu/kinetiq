import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'

export async function migrate(pool: Pool, folder = fileURLToPath(new URL('../migrations/', import.meta.url))): Promise<void> {
  const client = await pool.connect()
  let broken = false
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(7102026)')
    await client.query(`CREATE SCHEMA IF NOT EXISTS migration;
      REVOKE ALL ON SCHEMA migration FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS migration.applied (
        name text PRIMARY KEY, checksum text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());`)
    const applied = await client.query<{ name: string; checksum: string }>('SELECT name, checksum FROM migration.applied ORDER BY name')
    const filenames = (await readdir(folder)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()
    if (!filenames.length) throw new Error('No SQL migrations found')
    const known = new Map(applied.rows.map((row) => [row.name, row.checksum]))
    for (const name of known.keys()) if (!filenames.includes(name)) throw new Error(`Applied migration missing: ${name}`)
    for (const name of filenames) {
      const contents = await readFile(`${folder}/${name}`, 'utf8')
      // Stable across Windows and Linux checkouts.
      const normalized = contents.replaceAll('\r\n', '\n')
      const checksum = createHash('sha256').update(normalized).digest('hex')
      if (known.has(name)) {
        if (known.get(name) !== checksum) throw new Error(`Applied migration modified: ${name}`)
        continue
      }
      if (applied.rows.some((row) => row.name > name)) throw new Error(`Migration inserted out of order: ${name}`)
      await client.query(normalized)
      await client.query('INSERT INTO migration.applied (name, checksum) VALUES ($1, $2)', [name, checksum])
    }
    await client.query('COMMIT')
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { broken = true }
    throw error
  } finally { client.release(broken) }
}

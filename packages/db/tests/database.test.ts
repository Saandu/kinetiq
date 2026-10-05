import { randomBytes } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServicePool, database, insertTelemetryBatch, migrate, seed, withTenantTransaction } from '../src/index.js'
import { DEMO_ORGANIZATION, DEMO_MACHINES } from '../src/seed.js'
import type { TelemetryBatch } from '@kinetiq/contracts'

const OTHER_ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_SITE = '22222222-2222-4222-8222-222222222223'
const migrations = fileURLToPath(new URL('../migrations/', import.meta.url))
let container: StartedPostgreSqlContainer
let admin: Pool
let api: Pool
let ingest: Pool
let analytics: Pool
let alerts: Pool
const pools: Pool[] = []
const trusted = { organizationId: DEMO_ORGANIZATION, machineId: 'DEMO-CNC-01', thingName: 'DEMO-CNC-01' }

function batch(offset = 0): TelemetryBatch {
  const start = new Date(); start.setUTCHours(12, 0, 0, 0)
  return { v: 1, machineId: trusted.machineId, seq: 1, readings: [0, 10].map((seconds) => ({
    ts: new Date(start.getTime() + offset + seconds * 1000).toISOString(), online: true, state: 3,
    metrics: { temperatureC: 61.2, vibrationMmS: 2.4, spindleRpm: 11850, powerKw: 8 },
  })) }
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('kinetiq-postgres:18.6-1').withDatabase('kinetiq')
    .withUsername('postgres').withPassword(randomBytes(24).toString('hex')).start()
  admin = new Pool({ connectionString: container.getConnectionUri(), max: 2 }); pools.push(admin)
  await Promise.all([migrate(admin), migrate(admin)])
  await seed(admin)
  await admin.query(`INSERT INTO kinetiq.organizations (id, name) VALUES ($1, 'Other company');`, [OTHER_ORG])
  await admin.query("INSERT INTO kinetiq.sites (id, organization_id, name) VALUES ($1, $2, 'Other site')", [OTHER_SITE, OTHER_ORG])
  await admin.query(`INSERT INTO kinetiq.machines (id, organization_id, site_id, name, kind, location)
    VALUES ('OTHER-01', $1, $2, 'Other machine', 'milling', 'Elsewhere')`, [OTHER_ORG, OTHER_SITE])
  for (const role of ['kinetiq_api', 'kinetiq_ingest', 'kinetiq_analytics', 'kinetiq_alerts']) {
    const password = randomBytes(24).toString('hex')
    await admin.query(`ALTER ROLE ${role} LOGIN PASSWORD '${password}'`)
    const uri = new URL(container.getConnectionUri()); uri.username = role; uri.password = password
    const pool = new Pool({ connectionString: uri.toString(), max: 1 }); pools.push(pool)
    if (role === 'kinetiq_api') api = pool
    if (role === 'kinetiq_ingest') ingest = pool
    if (role === 'kinetiq_analytics') analytics = pool
    if (role === 'kinetiq_alerts') alerts = pool
  }
}, 120_000)

afterAll(async () => {
  await Promise.allSettled(pools.map((pool) => pool.end()))
  if (container) await container.stop()
})

describe('real PostgreSQL tenant and service boundaries', () => {
  it('runs PostgreSQL 18.6 with both planned extensions and scheduled jobs', async () => {
    expect((await admin.query('SHOW server_version')).rows[0].server_version).toMatch(/^18\.6/)
    const extensions = await admin.query("SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_partman', 'pg_cron') ORDER BY extname")
    expect(extensions.rows).toEqual([{ extname: 'pg_cron', extversion: '1.6' }, { extname: 'pg_partman', extversion: '5.5.0' }])
    expect((await admin.query('SELECT jobname FROM cron.job')).rowCount).toBeGreaterThanOrEqual(3)
  })

  it('applies migrations and development seed repeatably', async () => {
    await migrate(admin); await seed(admin)
    expect((await admin.query('SELECT * FROM migration.applied')).rowCount).toBe(2)
    expect((await admin.query('SELECT * FROM kinetiq.machines WHERE organization_id = $1', [DEMO_ORGANIZATION])).rowCount).toBe(DEMO_MACHINES.length)
  })

  it('fails closed without tenant context', async () => {
    expect((await api.query('SELECT * FROM kinetiq.machines')).rows).toEqual([])
    await expect(api.query("UPDATE kinetiq.machines SET hidden = true WHERE id = 'DEMO-CNC-01' RETURNING id")).resolves.toMatchObject({ rowCount: 0 })
  })

  it('isolates tenants even when a query omits its application filter', async () => {
    const first = await withTenantTransaction(api, DEMO_ORGANIZATION, (c) => c.query('SELECT id FROM kinetiq.machines'))
    expect(first.rowCount).toBe(DEMO_MACHINES.length)
    const other = await withTenantTransaction(api, OTHER_ORG, (c) => c.query('SELECT id FROM kinetiq.machines'))
    expect(other.rows).toEqual([{ id: 'OTHER-01' }])
  })

  it('clears tenant context after commit on the very same pooled connection', async () => {
    const pid = await withTenantTransaction(api, DEMO_ORGANIZATION, async (c) => (await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid)
    const raw = await api.query("SELECT pg_backend_pid() AS pid, nullif(current_setting('app.organization_id', true), '') AS tenant")
    expect(raw.rows[0]).toEqual({ pid, tenant: null })
    expect((await api.query('SELECT * FROM kinetiq.machines')).rows).toEqual([])
  })

  it('rolls back writes and clears context after an error', async () => {
    await expect(withTenantTransaction(api, DEMO_ORGANIZATION, async (c) => {
      await c.query("UPDATE kinetiq.machines SET hidden = true WHERE id = 'DEMO-CNC-01'")
      throw new Error('simulated failure')
    })).rejects.toThrow('simulated failure')
    const result = await withTenantTransaction(api, DEMO_ORGANIZATION, (c) => c.query("SELECT hidden FROM kinetiq.machines WHERE id = 'DEMO-CNC-01'"))
    expect(result.rows[0].hidden).toBe(false)
    expect((await api.query('SELECT * FROM kinetiq.machines')).rows).toEqual([])
  })

  it('rejects cross-tenant writes and cross-tenant foreign keys', async () => {
    await expect(withTenantTransaction(api, DEMO_ORGANIZATION, (c) => c.query(`INSERT INTO kinetiq.machines
      (id, organization_id, site_id, name, kind, location) VALUES ('FORGED-01', $1, $2, 'Forgery', 'milling', 'x')`, [OTHER_ORG, OTHER_SITE]))).rejects.toMatchObject({ code: '42501' })
    await expect(withTenantTransaction(api, DEMO_ORGANIZATION, (c) => c.query(`INSERT INTO kinetiq.machines
      (id, organization_id, site_id, name, kind, location) VALUES ('FORGED-02', $1, $2, 'Forgery', 'milling', 'x')`, [DEMO_ORGANIZATION, OTHER_SITE]))).rejects.toMatchObject({ code: '23503' })
  })

  it('enforces RLS on every tenant parent table and on a non-superuser owner', async () => {
    const tables = await admin.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'kinetiq' AND c.relkind IN ('r', 'p') AND NOT c.relispartition`)
    expect(tables.rowCount).toBe(18)
    expect(tables.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true)
    await admin.query('CREATE ROLE test_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA kinetiq TO test_owner; GRANT EXECUTE ON FUNCTION kinetiq.current_organization() TO test_owner; ALTER TABLE kinetiq.machines OWNER TO test_owner')
    const connection = await admin.connect()
    try {
      await connection.query('SET ROLE test_owner')
      expect((await connection.query('SELECT * FROM kinetiq.machines')).rows).toEqual([])
    } finally {
      await connection.query('RESET ROLE'); connection.release()
      await admin.query('ALTER TABLE kinetiq.machines OWNER TO postgres')
    }
  })

  it('keeps runtime roles unprivileged and schema creation restricted', async () => {
    const roles = await admin.query("SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname LIKE 'kinetiq_%'")
    expect(roles.rowCount).toBe(4)
    expect(roles.rows.every((r) => !r.rolsuper && !r.rolbypassrls && !r.rolcreatedb && !r.rolcreaterole)).toBe(true)
    await expect(api.query('CREATE TABLE public.unwanted (id int)')).rejects.toMatchObject({ code: '42501' })
    await expect(api.query('CREATE TABLE kinetiq.unwanted (id int)')).rejects.toMatchObject({ code: '42501' })
    await expect(ingest.query('SELECT * FROM kinetiq.app_users')).rejects.toMatchObject({ code: '42501' })
    await expect(ingest.query('DELETE FROM kinetiq.telemetry')).rejects.toMatchObject({ code: '42501' })
    await expect(ingest.query('SELECT temperature_c FROM kinetiq.telemetry')).rejects.toMatchObject({ code: '42501' })
    await expect(api.query('DELETE FROM kinetiq.audit_log')).rejects.toMatchObject({ code: '42501' })
    await expect(analytics.query("UPDATE kinetiq.model_settings SET method = 'isolation_forest'")).rejects.toMatchObject({ code: '42501' })
    await expect(alerts.query('SELECT * FROM kinetiq.app_users')).rejects.toMatchObject({ code: '42501' })
  })

  it('reads through the Drizzle schema under the same tenant transaction', async () => {
    const machines = await withTenantTransaction(api, DEMO_ORGANIZATION, (c) => database(c).query.machines.findMany())
    expect(machines.length).toBe(DEMO_MACHINES.length)
  })

  it('allows analytics health writes and API reads through monthly partitions', async () => {
    await withTenantTransaction(analytics, DEMO_ORGANIZATION, (c) => c.query(`INSERT INTO kinetiq.machine_health
      (machine_id, organization_id, ts, method, anomaly_score, health_score, confidence, contributors, model_version)
      VALUES ('DEMO-CNC-01', $1, now(), 'zscore', 20, 80, 0.9, '[]', 'test-model')`, [DEMO_ORGANIZATION]))
    const health = await withTenantTransaction(api, DEMO_ORGANIZATION, (c) => c.query('SELECT tableoid::regclass::text AS partition, health_score FROM kinetiq.machine_health'))
    expect(health.rows[0].partition).toMatch(/^kinetiq\.machine_health_p/)
    expect(health.rows[0].health_score).toBe(80)
    expect((await withTenantTransaction(api, OTHER_ORG, (c) => c.query('SELECT * FROM kinetiq.machine_health'))).rowCount).toBe(0)
  })

  it('enforces settings checks even when a caller bypasses Zod', async () => {
    await expect(withTenantTransaction(api, DEMO_ORGANIZATION, (c) => c.query("UPDATE kinetiq.machine_settings SET watch_below = 30 WHERE machine_id = 'DEMO-CNC-01'"))).rejects.toMatchObject({ code: '23514' })
    await expect(withTenantTransaction(api, DEMO_ORGANIZATION, (c) => c.query("UPDATE kinetiq.machine_settings SET state_names = ARRAY['only-one'] WHERE machine_id = 'DEMO-CNC-01'"))).rejects.toMatchObject({ code: '23514' })
  })

  it('uses explicit pool budgets for service connections', async () => {
    expect(() => createServicePool('ingest', { user: 'postgres' })).toThrow('Expected database identity')
    const pool = createServicePool('ingest', { user: 'kinetiq_ingest' })
    expect(pool.options.max).toBe(3)
    await pool.end()
  })
})

describe('ingest and partition correctness', () => {
  it('routes rows into daily partitions and ignores duplicate delivery', async () => {
    const message = batch()
    expect(await insertTelemetryBatch(ingest, trusted, message)).toBe(2)
    expect(await insertTelemetryBatch(ingest, trusted, message)).toBe(0)
    const rows = await withTenantTransaction(api, DEMO_ORGANIZATION, (c) => c.query(`SELECT tableoid::regclass::text AS partition
      FROM kinetiq.telemetry WHERE machine_id = $1 AND ts = $2`, [message.machineId, message.readings[0]!.ts]))
    expect(rows.rows[0].partition).toMatch(/^kinetiq\.telemetry_p/)
    expect((await api.query('SELECT * FROM kinetiq.telemetry')).rows).toEqual([])
    const column = (await admin.query("SELECT last_seen_at FROM kinetiq.devices WHERE thing_name = 'DEMO-CNC-01'")).rows[0].last_seen_at
    expect(column.toISOString()).toBe(message.readings[1]!.ts)
  })

  it('rejects mismatched and unknown device identity', async () => {
    await expect(insertTelemetryBatch(ingest, trusted, { ...batch(), machineId: 'OTHER-01' })).rejects.toThrow('authenticated device')
    await expect(insertTelemetryBatch(ingest, { ...trusted, thingName: 'UNKNOWN' }, batch())).rejects.toThrow('Unknown device mapping')
  })

  it('rolls back the whole batch when one reading has no partition', async () => {
    const message = batch(60_000)
    message.readings[1]!.ts = '2100-01-01T00:00:00.000Z'
    await expect(insertTelemetryBatch(ingest, trusted, message)).rejects.toMatchObject({ code: '23514' })
    expect((await admin.query('SELECT * FROM kinetiq.telemetry WHERE machine_id = $1 AND ts = $2', [message.machineId, message.readings[0]!.ts])).rowCount).toBe(0)
  })

  it('keeps last_seen monotonic when an older batch arrives later', async () => {
    await insertTelemetryBatch(ingest, trusted, batch(-60_000))
    const result = await admin.query("SELECT last_seen_at FROM kinetiq.devices WHERE thing_name = 'DEMO-CNC-01'")
    expect(result.rows[0].last_seen_at.toISOString()).toBe(batch().readings[1]!.ts)
  })

  it('prevents direct child-table access and maintains future partitions', async () => {
    const child = (await admin.query("SELECT inhrelid::regclass::text AS name FROM pg_inherits WHERE inhparent = 'kinetiq.telemetry'::regclass LIMIT 1")).rows[0].name
    await expect(api.query(`SELECT * FROM ${child}`)).rejects.toMatchObject({ code: '42501' })
    await admin.query("UPDATE partman.part_config SET premake = 9 WHERE parent_table = 'kinetiq.telemetry'")
    await admin.query("SELECT partman.run_maintenance(p_parent_table := 'kinetiq.telemetry', p_analyze := false)")
    const config = await admin.query("SELECT retention, retention_keep_table FROM partman.part_config WHERE parent_table = 'kinetiq.telemetry'")
    expect(config.rows[0]).toEqual({ retention: '30 days', retention_keep_table: false })
    const created = await admin.query("SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = 'kinetiq.telemetry'::regclass")
    expect(created.rows[0].n).toBeGreaterThanOrEqual(10)
  })

  it('actually drops an expired daily partition', async () => {
    await admin.query(`CREATE TABLE kinetiq.telemetry_p20000101 PARTITION OF kinetiq.telemetry
      FOR VALUES FROM ('2000-01-01T00:00:00Z') TO ('2000-01-02T00:00:00Z')`)
    await admin.query(`INSERT INTO kinetiq.telemetry
      (machine_id, organization_id, ts, temperature_c, vibration_mm_s, spindle_rpm, power_kw, state_index, online)
      VALUES ('DEMO-CNC-01', $1, '2000-01-01T12:00:00Z', 60, 2, 1000, 5, 3, true)`, [DEMO_ORGANIZATION])
    await admin.query("SELECT partman.run_maintenance(p_parent_table := 'kinetiq.telemetry', p_analyze := false)")
    expect((await admin.query("SELECT to_regclass('kinetiq.telemetry_p20000101') AS old")).rows[0].old).toBeNull()
  })

  it('notifies listeners only after committed rows are readable', async () => {
    const listener = await api.connect()
    await listener.query('LISTEN kinetiq_telemetry')
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const signal = new Promise<string | undefined>((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Notification not received')), 5_000)
        listener.once('notification', (event) => resolve(event.payload))
      })
      await insertTelemetryBatch(ingest, trusted, batch(120_000))
      expect(JSON.parse((await signal)!)).toEqual({ organizationId: DEMO_ORGANIZATION, machineId: trusted.machineId })
      expect((await admin.query('SELECT * FROM kinetiq.telemetry WHERE machine_id = $1 AND ts = $2', [trusted.machineId, batch(120_000).readings[0]!.ts])).rowCount).toBe(1)
    } finally {
      clearTimeout(timeout); listener.removeAllListeners('notification')
      await listener.query('UNLISTEN *'); listener.release()
    }
  })

  it('deduplicates open alerts while allowing a condition to reopen', async () => {
    const open = () => withTenantTransaction(alerts, DEMO_ORGANIZATION, (c) => c.query(`INSERT INTO kinetiq.alerts
      (machine_id, organization_id, level, kind, message_key, dedupe_key) VALUES ('DEMO-CNC-01', $1, 2, 'anomaly', 'test', 'condition-1')`, [DEMO_ORGANIZATION]))
    await open()
    await expect(open()).rejects.toMatchObject({ code: '23505' })
    await withTenantTransaction(alerts, DEMO_ORGANIZATION, (c) => c.query("UPDATE kinetiq.alerts SET resolved_at = now() WHERE dedupe_key = 'condition-1'"))
    await open()
  })
})

describe('migration safety', () => {
  it('rolls back a failed migration without leaving tables or journal entries', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'kinetiq-migration-failure-'))
    try {
      await cp(migrations, folder, { recursive: true })
      await writeFile(join(folder, '0002_failure.sql'), 'CREATE TABLE kinetiq.failed_migration_probe (id int); SELECT missing_function();')
      await expect(migrate(admin, folder)).rejects.toMatchObject({ code: '42883' })
      expect((await admin.query("SELECT to_regclass('kinetiq.failed_migration_probe') AS probe")).rows[0].probe).toBeNull()
      expect((await admin.query("SELECT * FROM migration.applied WHERE name = '0002_failure.sql'")).rowCount).toBe(0)
    } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('rejects edits to an already applied migration', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'kinetiq-migrations-'))
    try {
      await cp(migrations, folder, { recursive: true })
      const name = join(folder, '0001_security_and_partitions.sql')
      await writeFile(name, await readFile(name, 'utf8') + '\n-- unexpected edit\n')
      await expect(migrate(admin, folder)).rejects.toThrow('Applied migration modified')
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
})

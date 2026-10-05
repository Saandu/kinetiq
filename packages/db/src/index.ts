import { Pool, type PoolClient, type PoolConfig } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { telemetryBatchSchema, type TelemetryBatch } from '@kinetiq/contracts'
import * as schema from './schema.js'

export { schema }
export { migrate } from './migrate.js'
export { seed } from './seed.js'
export const POOL_LIMITS = { api: 5, ingest: 3, alerts: 2, analytics: 2 } as const
export type Service = keyof typeof POOL_LIMITS

export function createServicePool(service: Service, config: Omit<PoolConfig, 'max'>): Pool {
  const user = config.user ?? (config.connectionString ? decodeURIComponent(new URL(config.connectionString).username) : undefined)
  if (user !== `kinetiq_${service}`) throw new Error(`Expected database identity kinetiq_${service}`)
  return new Pool({ ...config, max: POOL_LIMITS[service], connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000 })
}
export function database(client: PoolClient) { return drizzle(client, { schema }) }

// Tenant identity must already have been resolved from trusted authentication.
export async function withTenantTransaction<T>(pool: Pool, organizationId: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
    throw new Error('Invalid organization UUID')
  }
  const client = await pool.connect()
  let broken = false
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.organization_id', $1, true)", [organizationId])
    const result = await action(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { broken = true }
    throw error
  } finally {
    client.release(broken)
  }
}

export interface TrustedDevice { organizationId: string; machineId: string; thingName: string }
// Ingest's trusted envelope determines identity. Never take organizationId from JSON.
export async function insertTelemetryBatch(pool: Pool, device: TrustedDevice, input: TelemetryBatch): Promise<number> {
  const batch = telemetryBatchSchema.parse(input)
  if (batch.machineId !== device.machineId) throw new Error('Payload machine does not match authenticated device')
  return withTenantTransaction(pool, device.organizationId, async (client) => {
    const mapped = await client.query(
      'SELECT thing_name FROM kinetiq.devices WHERE thing_name = $1 AND machine_id = $2 AND organization_id = $3',
      [device.thingName, device.machineId, device.organizationId],
    )
    if (mapped.rowCount !== 1) throw new Error('Unknown device mapping')
    const rows = batch.readings.map((reading) => ({
      organization_id: device.organizationId, machine_id: batch.machineId, ts: reading.ts,
      temperature_c: reading.metrics.temperatureC, vibration_mm_s: reading.metrics.vibrationMmS,
      spindle_rpm: reading.metrics.spindleRpm, power_kw: reading.metrics.powerKw,
      state_index: reading.state, online: reading.online,
    }))
    const inserted = await client.query(`
      INSERT INTO kinetiq.telemetry (organization_id, machine_id, ts, temperature_c, vibration_mm_s, spindle_rpm, power_kw, state_index, online)
      SELECT organization_id, machine_id, ts, temperature_c, vibration_mm_s, spindle_rpm, power_kw, state_index, online
      FROM jsonb_to_recordset($1::jsonb) AS r(organization_id uuid, machine_id text, ts timestamptz,
        temperature_c real, vibration_mm_s real, spindle_rpm real, power_kw real, state_index smallint, online bool)
      ON CONFLICT (machine_id, ts) DO NOTHING`, [JSON.stringify(rows)])
    await client.query(`UPDATE kinetiq.devices SET last_seen_at = GREATEST(last_seen_at, $1::timestamptz)
      WHERE thing_name = $2 AND organization_id = $3`, [batch.readings.at(-1)!.ts, device.thingName, device.organizationId])
    if (inserted.rowCount) {
      // PostgreSQL delivers this signal only when the transaction commits.
      await client.query("SELECT pg_notify('kinetiq_telemetry', $1)", [JSON.stringify({ organizationId: device.organizationId, machineId: device.machineId })])
    }
    return inserted.rowCount ?? 0
  })
}

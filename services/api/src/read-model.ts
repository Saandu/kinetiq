import type { PoolClient } from 'pg'
import { machineListSchema, machineStatusSchema, machineTelemetrySchema, notificationListSchema, notificationSnapshotSchema,
  maintenanceListSchema, machineSettingsSchema, modelSettingsSchema, seriesSchema, healthHistorySchema } from '@kinetiq/contracts'

const epoch = (value: Date | null) => value?.getTime() ?? null
type SummaryRow = { id: string; ts: Date | null; online: boolean | null; temperature_c: number | null; vibration_mm_s: number | null;
  spindle_rpm: number | null; power_kw: number | null; state_index: number | null; samples: number; availability: number | null;
  watch_below: number; warning_below: number; critical_below: number; alert_level: number | null }

export async function listMachines(client: PoolClient) {
  return machineListSchema.parse((await client.query('SELECT id, name, kind, location FROM kinetiq.machines WHERE NOT hidden ORDER BY id LIMIT 500')).rows)
}
export async function visibleMachine(client: PoolClient, id: string): Promise<boolean> {
  return (await client.query('SELECT id FROM kinetiq.machines WHERE id=$1 AND NOT hidden', [id])).rowCount === 1
}
async function summaries(client: PoolClient, now: Date, id: string | null = null): Promise<SummaryRow[]> {
  // Each lateral lookup uses the machine/time primary key and prunes daily partitions.
  return (await client.query<SummaryRow>(`SELECT m.id, latest.*, totals.samples, totals.availability,
      s.watch_below, s.warning_below, s.critical_below, alerts.alert_level
    FROM kinetiq.machines m JOIN kinetiq.machine_settings s ON s.machine_id=m.id
    LEFT JOIN LATERAL (SELECT ts, online, temperature_c, vibration_mm_s, spindle_rpm, power_kw, state_index
      FROM kinetiq.telemetry WHERE machine_id=m.id AND ts >= $1::timestamptz - interval '24 hours'
        AND ts <= $1::timestamptz ORDER BY ts DESC LIMIT 1) latest ON true
    LEFT JOIN LATERAL (SELECT count(*)::int AS samples, avg(online::int)*100 AS availability
      FROM kinetiq.telemetry WHERE machine_id=m.id AND ts >= $1::timestamptz - interval '24 hours' AND ts <= $1::timestamptz) totals ON true
    LEFT JOIN LATERAL (SELECT max(level)::int AS alert_level FROM kinetiq.alerts WHERE machine_id=m.id AND resolved_at IS NULL) alerts ON true
    WHERE NOT m.hidden AND ($2::text IS NULL OR m.id=$2) ORDER BY m.id LIMIT 500`, [now, id])).rows
}
function status(row: SummaryRow, now: Date) {
  const online = row.online === true && row.ts !== null && now.getTime() - row.ts.getTime() <= 120_000
  const availability = row.availability === null ? null : Number(row.availability)
  const thresholdLevel = availability === null ? 0 : availability >= row.watch_below ? 0 : availability >= row.warning_below ? 1 : availability >= row.critical_below ? 2 : 3
  return machineStatusSchema.parse({ id: row.id, online, availability,
    alert: Math.max(row.ts && !online ? 3 : 0, thresholdLevel, row.alert_level ?? 0), lastReadingAt: epoch(row.ts), samples: row.samples })
}
export async function listStatuses(client: PoolClient, now: Date) {
  return (await summaries(client, now)).map((row) => status(row, now))
}
export async function getTelemetry(client: PoolClient, id: string, now: Date) {
  const row = (await summaries(client, now, id))[0]
  if (!row) return null
  const health = (await client.query<{ anomaly_score: number; confidence: number }>(`SELECT anomaly_score, confidence FROM kinetiq.machine_health
    WHERE machine_id=$1 AND ts <= $2 AND ts >= $2::timestamptz - interval '24 hours' ORDER BY ts DESC LIMIT 1`, [id, now])).rows[0]
  const states = (await client.query<{ index: number; count: number }>(`SELECT state_index::int AS index, count(*)::int AS count
    FROM kinetiq.telemetry WHERE machine_id=$1 AND ts >= $2::timestamptz - interval '24 hours' AND ts <= $2 GROUP BY state_index ORDER BY state_index`, [id, now])).rows
  const modes = (await client.query<{ maintenance_mode: boolean; monitoring_enabled: boolean }>('SELECT maintenance_mode, monitoring_enabled FROM kinetiq.machine_modes WHERE machine_id=$1', [id])).rows[0]
  const maintenance = await getMaintenance(client, id)
  const faults = (await client.query<{ category: string; started_at: Date }>('SELECT category, started_at FROM kinetiq.fault_events WHERE machine_id=$1 ORDER BY started_at DESC, id DESC LIMIT 2', [id])).rows
  return machineTelemetrySchema.parse({ id, online: status(row, now).online, availability: status(row, now).availability,
    anomalyScore: health?.anomaly_score ?? null, confidence: health?.confidence ?? null,
    activeStates: states.length, states: states.map((state) => ({ index: state.index, share: state.count / row.samples })), currentState: row.state_index,
    maintenance: { previous: maintenance[1] ? { category: maintenance[1].category, at: maintenance[1].at } : null,
      current: maintenance[0] ? { category: maintenance[0].category, at: maintenance[0].at } : null, next: null },
    faults: { previous: faults[1] ? { category: faults[1].category, at: faults[1].started_at.getTime() } : null,
      current: faults[0] ? { category: faults[0].category, at: faults[0].started_at.getTime() } : null, next: null },
    maintenanceMode: modes?.maintenance_mode ?? false, monitoringEnabled: modes?.monitoring_enabled ?? true,
    latestReading: row.ts ? { at: row.ts.getTime(), metrics: { temperatureC: row.temperature_c, vibrationMmS: row.vibration_mm_s, spindleRpm: row.spindle_rpm, powerKw: row.power_kw } } : null,
    samples: row.samples,
  })
}
export async function getSettings(client: PoolClient, id: string) {
  const row = (await client.query<{ state_names: string[]; watch_below: number; warning_below: number; critical_below: number }>(
    'SELECT state_names, watch_below, warning_below, critical_below FROM kinetiq.machine_settings WHERE machine_id=$1', [id])).rows[0]
  return row ? machineSettingsSchema.parse({ stateNames: row.state_names, alertThresholds: { watchBelow: row.watch_below, warningBelow: row.warning_below, criticalBelow: row.critical_below } }) : null
}
export async function getMaintenance(client: PoolClient, id: string) {
  const rows = (await client.query<{ id: string; machine_id: string; category: string; at: Date }>(
    'SELECT id, machine_id, category, at FROM kinetiq.maintenance_entries WHERE machine_id=$1 ORDER BY at DESC, id DESC LIMIT 100', [id])).rows
  return maintenanceListSchema.parse(rows.map((row) => ({ id: row.id, machineId: row.machine_id, category: row.category, at: row.at.getTime() })))
}
export async function getAlerts(client: PoolClient, id: string) {
  const rows = (await client.query<{ id: string; machine_id: string; level: number; message_key: string; value: number | null; opened_at: Date; snapshot: unknown }>(
    'SELECT id, machine_id, level, message_key, value, opened_at, snapshot FROM kinetiq.alerts WHERE machine_id=$1 AND resolved_at IS NULL ORDER BY opened_at DESC, id DESC LIMIT 100', [id])).rows
  return notificationListSchema.parse(rows.map((row) => { const snapshot = notificationSnapshotSchema.safeParse(row.snapshot); return {
    id: row.id, machineId: row.machine_id, level: row.level, messageKey: row.message_key, value: row.value?.toString() ?? '', at: row.opened_at.getTime(),
    tone: row.level > 0 ? 'bad' : 'good', snapshot: snapshot.success ? snapshot.data : null,
  } }))
}
export async function getModel(client: PoolClient, id: string) {
  const row = (await client.query<{ method: string; window_minutes: number; zscore_threshold: number; contamination: number; min_confidence: number }>(
    'SELECT method, window_minutes, zscore_threshold, contamination, min_confidence FROM kinetiq.model_settings WHERE machine_id=$1', [id])).rows[0]
  return row ? modelSettingsSchema.parse({ method: row.method, windowMinutes: row.window_minutes, zscoreThreshold: row.zscore_threshold, contamination: row.contamination, minConfidence: row.min_confidence }) : null
}
const rawColumns = { temperatureC: 'temperature_c', vibrationMmS: 'vibration_mm_s', spindleRpm: 'spindle_rpm', powerKw: 'power_kw' } as const
const hourlyColumns = { temperatureC: 'temperature', vibrationMmS: 'vibration', spindleRpm: 'spindle', powerKw: 'power' } as const
export type Metric = keyof typeof rawColumns
export async function getSeries(client: PoolClient, id: string, metric: Metric, from: Date, to: Date, bucket: 'minute' | 'hour') {
  const rows = bucket === 'minute'
    ? await client.query<{ at: Date; avg: number; min: number; max: number; samples: number }>(`SELECT date_trunc('minute', ts) AS at,
      avg(${rawColumns[metric]}) AS avg, min(${rawColumns[metric]}) AS min, max(${rawColumns[metric]}) AS max, count(*)::int AS samples
      FROM kinetiq.telemetry WHERE machine_id=$1 AND ts >= $2 AND ts < $3 GROUP BY 1 ORDER BY 1 LIMIT 1440`, [id, from, to])
    : await client.query<{ at: Date; avg: number; min: number; max: number; samples: number }>(`SELECT hour AS at,
      ${hourlyColumns[metric]}_avg AS avg, ${hourlyColumns[metric]}_min AS min, ${hourlyColumns[metric]}_max AS max, samples
      FROM kinetiq.telemetry_hourly WHERE machine_id=$1 AND hour >= $2 AND hour < $3 ORDER BY hour LIMIT 1440`, [id, from, to])
  return seriesSchema.parse(rows.rows.map((row) => ({ ...row, at: row.at.getTime() })))
}
export async function getHealth(client: PoolClient, id: string, from: Date, to: Date) {
  const rows = (await client.query<{ ts: Date; method: string; anomaly_score: number; health_score: number; confidence: number; contributors: unknown; model_version: string }>(
    `SELECT ts, method, anomaly_score, health_score, confidence, contributors, model_version FROM kinetiq.machine_health
    WHERE machine_id=$1 AND ts >= $2 AND ts < $3 ORDER BY ts LIMIT 1440`, [id, from, to])).rows
  return healthHistorySchema.parse(rows.map((row) => ({ at: row.ts.getTime(), method: row.method, anomalyScore: row.anomaly_score,
    healthScore: row.health_score, confidence: row.confidence, contributors: row.contributors, modelVersion: row.model_version })))
}

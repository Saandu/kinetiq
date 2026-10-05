import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import { machineListSchema, machineTelemetrySchema } from '@kinetiq/contracts'

const origin = 'http://127.0.0.1:3101'
async function json(path) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(10_000) })
  assert.equal(response.status, 200, `Expected successful ${path}`)
  return response.json()
}
const machines = machineListSchema.parse(await json('/v1/machines'))
assert.equal(machines.length, 12)
let readings = []
for (let attempt = 0; attempt < 40; attempt++) {
  readings = await Promise.all(machines.map(async ({ id }) => machineTelemetrySchema.parse(await json(`/v1/machines/${id}/telemetry`))))
  if (readings.every(row => row.latestReading && row.samples > 0)) break
  await wait(2000)
}
assert.ok(readings.every(row => row.latestReading && row.samples > 0), 'Every registered device must reach the API')
for (const row of readings) {
  const reading = row.latestReading
  assert.ok(reading)
  assert.equal(row.anomalyScore, null, 'Unimplemented analytics must stay unavailable')
  assert.equal(row.confidence, null)
  // IDs and timestamps have passed bounded runtime contracts; no credentials in arguments/output.
  const sql = `SELECT json_build_object('temperatureC',temperature_c,'vibrationMmS',vibration_mm_s,'spindleRpm',spindle_rpm,'powerKw',power_kw) FROM kinetiq.telemetry WHERE machine_id='${row.id}' AND ts=to_timestamp(${reading.at}/1000.0)`
  const result = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'kinetiq', '-Atc', sql], { encoding: 'utf8' })
  assert.equal(result.status, 0, 'Database evidence query must succeed')
  assert.deepEqual(JSON.parse(result.stdout.trim()), reading.metrics, 'API metrics must match persisted sensor values')
}
const deep = await fetch(`${origin}/machines/DEMO-CNC-01`)
assert.equal(deep.status, 200)
assert.ok((await deep.text()).includes('<div id="app">'))
const denied = await fetch(`${origin}/v1/machines/DEMO-CNC-01/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' })
assert.equal(denied.status, 405)
console.log('Compose acceptance passed: 12 devices → MQTT → SQS → PostgreSQL → same-origin API; stored metrics match, deep links work, writes refused')

import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { machineListSchema, machineTelemetrySchema } from '@kinetiq/contracts';
import { assertLocalCluster, kubectl, namespace, capture } from './local-kubernetes.mjs';

assertLocalCluster();
const origin = 'http://127.0.0.1:3102';
const started = Date.now();
async function json(path) {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200, `Expected successful ${path}`);
  return response.json();
}
const machines = machineListSchema.parse(await json('/v1/machines'));
assert.equal(machines.length, 12);
let readings;
for (let attempt = 0; attempt < 50; attempt++) {
  readings = await Promise.all(machines.map(async ({ id }) => machineTelemetrySchema.parse(await json(`/v1/machines/${id}/telemetry`))));
  if (readings.every(row => row.latestReading?.at >= started)) break;
  await wait(2000);
}
assert.ok(readings.every(row => row.latestReading?.at >= started), 'All twelve devices must produce new readings during this verification');
const query = sql => kubectl(['exec', 'kinetiq-db-1', '-c', 'postgres', '-n', namespace, '--',
  'psql', '-U', 'postgres', '-d', 'kinetiq', '-Atc', sql], capture).trim();
for (const row of readings) {
  assert.match(row.id, /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/);
  assert.ok(Number.isSafeInteger(row.latestReading.at));
  assert.equal(row.anomalyScore, null);
  assert.equal(row.confidence, null);
  const sql = `SELECT json_build_object('temperatureC',temperature_c,'vibrationMmS',vibration_mm_s,'spindleRpm',spindle_rpm,'powerKw',power_kw) FROM kinetiq.telemetry WHERE machine_id='${row.id}' AND ts=to_timestamp(${row.latestReading.at}/1000.0)`;
  assert.deepEqual(JSON.parse(query(sql)), row.latestReading.metrics, 'API values must match the committed database row');
}
for (const role of ['kinetiq_api', 'kinetiq_ingest']) {
  assert.equal(query(`SELECT count(*) > 0 AND bool_and(s.ssl) FROM pg_stat_activity a JOIN pg_stat_ssl s USING(pid) WHERE a.usename='${role}'`), 't', `${role} connections must use TLS`);
}
const deep = await fetch(`${origin}/machines/DEMO-CNC-01`);
assert.equal(deep.status, 200);
assert.ok((await deep.text()).includes('<div id="app">'));
const denied = await fetch(`${origin}/v1/machines/DEMO-CNC-01/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
assert.equal(denied.status, 405);
// Exercise the helper inside the running image as well as in its package tests.
kubectl(['exec', 'deployment/kinetiq-api', '-c', 'api', '-n', namespace, '--', 'node', '--input-type=module', '-e',
  "import assert from 'node:assert/strict'; import {databaseTls} from '@kinetiq/runtime'; for (const parameter of ['ssl=0','sslmode=disable']) assert.throws(() => databaseTls('postgresql://postgres/kinetiq?' + parameter), /must not override/); console.log('Running API rejects TLS overrides');"]);
console.log('Kubernetes acceptance passed: 12 newly moving devices, stored metrics match the API, verified database TLS, deep links and read-only boundaries. Open http://127.0.0.1:3102');

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { migrate, seed, withTenantTransaction, resolveDevice, insertTelemetryBatch } from '@kinetiq/db';

const host = process.env.DB_HOST;
assert.ok(['kinetiq-db-rw', 'kinetiq-db-restore-rw'].includes(host));
const organization = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
async function pool(role) {
  const connection = new URL((await readFile(`/secrets/${role}/database-url`, 'utf8')).trim());
  assert.equal(connection.hostname, 'postgres');
  connection.hostname = host;
  const ssl = process.env.DB_TLS === 'true'
    ? { ca: await readFile('/secrets/ca/ca.crt', 'utf8'), rejectUnauthorized: true }
    : false;
  return new Pool({ connectionString: connection.href, ssl, max: 1, connectionTimeoutMillis: 10_000 });
}
const [admin, api, ingest] = await Promise.all(['admin', 'api', 'ingest'].map(pool));
try {
  if (process.env.DB_TLS === 'true') {
    assert.equal((await admin.query('SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()')).rows[0].ssl, true);
    const connection = new URL((await readFile('/secrets/admin/database-url', 'utf8')).trim());
    connection.hostname = host;
    const insecure = new Pool({ connectionString: connection.href, ssl: false, max: 1 });
    connection.hostname = host.replace(/-rw$/, '-tls-mismatch');
    const wrongName = new Pool({ connectionString: connection.href, max: 1,
      ssl: { ca: await readFile('/secrets/ca/ca.crt', 'utf8'), rejectUnauthorized: true } });
    try {
      await assert.rejects(insecure.query('SELECT 1'), { code: '28000' });
      await assert.rejects(wrongName.query('SELECT 1'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    } finally { await Promise.allSettled([insecure.end(), wrongName.end()]); }
  }
  if (process.env.DB_INITIALIZE === 'true') {
    assert.equal(host, 'kinetiq-db-rw', 'Never migrate a restore before verifying it');
    await migrate(admin); await migrate(admin);
    await seed(admin, 12); await seed(admin, 12);
    for (const role of ['api', 'ingest']) {
      const password = (await readFile(`/secrets/${role}/password`, 'utf8')).trim();
      assert.match(password, /^[a-f0-9]{64}$/);
      await admin.query(`ALTER ROLE kinetiq_${role} LOGIN PASSWORD '${password}'`);
    }
    const device = await resolveDevice(ingest, { thingName: 'DEMO-CNC-01', machineId: 'DEMO-CNC-01',
      siteId: '11111111-1111-4111-8111-111111111112' });
    const input = { v: 1, machineId: device.machineId, seq: 1, readings: [{
      ts: new Date().toISOString(), state: 3, online: true,
      metrics: { temperatureC: 61.25, vibrationMmS: 2.5, spindleRpm: 12000, powerKw: 8 },
    }] };
    assert.equal(await insertTelemetryBatch(ingest, device, input), 1);
    assert.equal(await insertTelemetryBatch(ingest, device, input), 0);
  }
  assert.match((await admin.query('SHOW server_version')).rows[0].server_version, /^18\.6/);
  assert.equal((await admin.query('SHOW max_connections')).rows[0].max_connections, '50');
  assert.deepEqual((await admin.query("SELECT extname, extversion FROM pg_extension WHERE extname IN ('pg_cron','pg_partman') ORDER BY extname")).rows,
    [{ extname: 'pg_cron', extversion: '1.6' }, { extname: 'pg_partman', extversion: '5.5.0' }]);
  assert.equal((await admin.query('SELECT * FROM migration.applied')).rowCount, 4);
  assert.ok((await admin.query('SELECT jobname FROM cron.job')).rowCount >= 3);
  assert.equal((await api.query('SELECT id FROM kinetiq.machines')).rowCount, 0, 'Missing tenant fails closed');
  const first = await withTenantTransaction(api, organization, client => client.query('SELECT id FROM kinetiq.machines'));
  assert.equal(first.rowCount, 12);
  const second = await withTenantTransaction(api, other, client => client.query('SELECT id FROM kinetiq.machines'));
  assert.equal(second.rowCount, 0, 'Unfiltered query still respects tenant isolation');
  assert.equal((await api.query("SELECT nullif(current_setting('app.organization_id', true), '') AS tenant")).rows[0].tenant, null);
  await assert.rejects(withTenantTransaction(ingest, other, client => client.query(
    "INSERT INTO kinetiq.telemetry (organization_id,machine_id,ts,temperature_c,vibration_mm_s,spindle_rpm,power_kw,state_index,online) VALUES ($1,'DEMO-CNC-01',now(),20,1,1000,2,3,true)", [organization])), { code: '42501' });
  const roles = (await admin.query("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('kinetiq_api','kinetiq_ingest') ORDER BY rolname")).rows;
  assert.equal(roles.length, 2);
  assert.ok(roles.every(role => !role.rolsuper && !role.rolbypassrls));
  const rows = (await admin.query('SELECT * FROM kinetiq.telemetry ORDER BY machine_id, ts')).rows;
  assert.ok(rows.length > 0);
  const routed = await admin.query('SELECT DISTINCT tableoid::regclass::text AS partition FROM kinetiq.telemetry');
  assert.ok(routed.rows.every(row => row.partition.startsWith('kinetiq.telemetry_p')));
  const fingerprint = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  console.log(JSON.stringify({ fingerprint, rows: rows.length, machines: first.rowCount,
    checks: `${process.env.DB_TLS === 'true' ? 'verified TLS/plaintext rejection/hostname verification/' : ''}version/extensions/migrations/cron/RLS/pooling/roles/partitions` }));
} finally { await Promise.allSettled([admin.end(), api.end(), ingest.end()]); }

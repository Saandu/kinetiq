import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createServicePool, migrate, seed } from '@kinetiq/db'
import { buildApi } from '../src/index.js'

const org = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const clock = new Date(); clock.setUTCSeconds(0, 0)
let container: StartedPostgreSqlContainer
let admin: Pool
let pool: Pool
let app: Awaited<ReturnType<typeof buildApi>>
let second: Awaited<ReturnType<typeof buildApi>>
beforeAll(async () => {
  container = await new PostgreSqlContainer('kinetiq-postgres:18.6-1').withDatabase('kinetiq').withUsername('postgres').withPassword(randomBytes(24).toString('hex')).start()
  admin = new Pool({ connectionString: container.getConnectionUri(), max: 1 })
  await migrate(admin); await seed(admin, 12)
  await admin.query("INSERT INTO kinetiq.organizations(id,name) VALUES($1,'Other tenant')", [other])
  await admin.query("INSERT INTO kinetiq.sites(id,organization_id,name) VALUES($1,$1,'Other floor')", [other])
  await admin.query("INSERT INTO kinetiq.machines(id,organization_id,site_id,name,kind,location) VALUES('OTHER-01',$1,$1,'Other machine','milling','Other floor')", [other])
  await admin.query("INSERT INTO kinetiq.machine_settings(machine_id,organization_id,state_names) VALUES('OTHER-01',$1,ARRAY['','','','','','','',''])", [other])
  await admin.query(`INSERT INTO kinetiq.telemetry(machine_id,organization_id,ts,temperature_c,vibration_mm_s,spindle_rpm,power_kw,state_index,online)
    VALUES('DEMO-CNC-01',$1,$2,40,2,5000,4,2,true),('DEMO-CNC-01',$1,$2::timestamptz-interval '10 seconds',50,3,6000,5,3,false),
      ('OTHER-01',$3,$2,99,9,9000,9,7,true)`, [org, clock, other])
  await admin.query(`INSERT INTO kinetiq.machine_health(machine_id,organization_id,ts,method,anomaly_score,health_score,confidence,contributors,model_version)
    VALUES('OTHER-01',$1,$2,'zscore',50,50,0.9,'[]','other-only')`, [other, clock])
  await admin.query("UPDATE kinetiq.machines SET hidden=true WHERE id='DEMO-DRL-02'")
  const password = randomBytes(24).toString('hex')
  await admin.query(`ALTER ROLE kinetiq_api LOGIN PASSWORD '${password}'`)
  const uri = new URL(container.getConnectionUri()); uri.username = 'kinetiq_api'; uri.password = password
  pool = createServicePool('api', { connectionString: uri.toString() })
  app = await buildApi({ pool, demoOrganizationId: org, now: () => clock })
  second = await buildApi({ pool, demoOrganizationId: other, now: () => clock })
}, 120_000)
afterAll(async () => {
  await Promise.allSettled([app?.close(), second?.close()])
  await Promise.allSettled([pool?.end(), admin?.end()])
  if (container) await container.stop()
})
const get = (url: string) => app.inject({ method: 'GET', url })
describe('real read API tenant boundaries', () => {
  it('lists visible machines only and ignores caller-selected tenant headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/machines', headers: { 'x-organization-id': other, 'x-request-id': 'caller-controlled' } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toHaveLength(11)
    expect(response.json().some((machine: { id: string }) => machine.id === 'OTHER-01' || machine.id === 'DEMO-DRL-02')).toBe(false)
    expect(response.headers['x-request-id']).not.toBe('caller-controlled')
    expect(response.headers['cache-control']).toBe('no-store')
  })
  it('returns persisted metrics and sample-based availability without fabricated analytics', async () => {
    const response = await get('/v1/machines/DEMO-CNC-01/telemetry')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ id: 'DEMO-CNC-01', availability: 50, online: true, anomalyScore: null, confidence: null,
      samples: 2, currentState: 2, latestReading: { at: clock.getTime(), metrics: { temperatureC: 40 } },
      states: [{ index: 2, share: 0.5 }, { index: 3, share: 0.5 }], faults: { previous: null, current: null, next: null } })
  })
  it('represents no samples as unknown and treats stale data as offline', async () => {
    const waiting = (await get('/v1/machines/DEMO-PMP-08/telemetry')).json()
    expect(waiting).toMatchObject({ availability: null, currentState: null, latestReading: null, samples: 0, states: [] })
    const stale = await buildApi({ pool, demoOrganizationId: org, now: () => new Date(clock.getTime() + 121_000) })
    try { expect((await stale.inject('/v1/machines/status')).json().find((row: { id: string }) => row.id === 'DEMO-CNC-01')).toMatchObject({ online: false, alert: 3 }) }
    finally { await stale.close() }
  })
  it('hides other-tenant, hidden, and unknown machines across every machine route', async () => {
    for (const id of ['OTHER-01', 'DEMO-DRL-02', 'UNKNOWN-01']) {
      for (const route of ['telemetry', 'settings', 'maintenance', 'alerts', 'model']) expect((await get(`/v1/machines/${id}/${route}`)).statusCode).toBe(404)
    }
  })
  it('keeps concurrent tenants isolated on the same API connection pool', async () => {
    for (let i = 0; i < 10; i++) {
      const [first, otherResponse] = await Promise.all([get('/v1/machines'), second.inject('/v1/machines')])
      expect(first.json().every((row: { id: string }) => row.id !== 'OTHER-01')).toBe(true)
      expect(otherResponse.json().map((row: { id: string }) => row.id)).toEqual(['OTHER-01'])
    }
    expect((await pool.query('SELECT id FROM kinetiq.machines')).rowCount).toBe(0)
  })
  it('rejects unbounded, reversed, malformed and tenant-supplied query parameters', async () => {
    const from = new Date(clock.getTime() - 60_000).toISOString(); const to = clock.toISOString()
    for (const url of ['/v1/machines?organizationId='+other, '/v1/machines/%27/telemetry',
      `/v1/machines/DEMO-CNC-01/series?metric=temperatureC&bucket=minute&from=${to}&to=${from}`,
      `/v1/machines/DEMO-CNC-01/series?metric=temperatureC&bucket=minute&from=2020-01-01T00:00:00Z&to=${to}`,
      `/v1/machines/DEMO-CNC-01/series?metric=temperatureC%3BDROP&bucket=minute&from=${from}&to=${to}`]) {
      const response = await get(url); expect(response.statusCode).toBe(400)
      expect(response.headers['content-type']).toContain('application/problem+json')
      expect(response.json()).toMatchObject({ status: 400, type: 'about:blank', requestId: expect.any(String) })
    }
  })
  it('buckets stored raw readings and returns empty health for an unscored machine', async () => {
    const from = new Date(clock.getTime() - 120_000).toISOString(); const to = new Date(clock.getTime() + 1).toISOString()
    const series = await get(`/v1/machines/DEMO-CNC-01/series?metric=temperatureC&bucket=minute&from=${from}&to=${to}`)
    expect(series.statusCode).toBe(200); expect(series.json().reduce((sum: number, row: { samples: number }) => sum + row.samples, 0)).toBe(2)
    expect((await get(`/v1/machines/DEMO-CNC-01/health?from=${from}&to=${to}`)).json()).toEqual([])
  })
  it('refreshes hourly history repeatably with correct aggregates and restricted execution', async () => {
    const from = new Date(clock.getTime() - 3_600_000).toISOString()
    const to = new Date(clock.getTime() + 1).toISOString()
    for (let i = 0; i < 2; i++) await admin.query('SELECT kinetiq.refresh_hourly($1,$2)', [from, to])
    const result = await get(`/v1/machines/DEMO-CNC-01/series?metric=temperatureC&bucket=hour&from=${from}&to=${to}`)
    expect(result.statusCode).toBe(200)
    const samples = result.json() as { samples: number; avg: number; min: number; max: number }[]
    expect(samples.reduce((sum, row) => sum + row.samples, 0)).toBe(2)
    expect(samples.reduce((sum, row) => sum + row.avg * row.samples, 0) / 2).toBe(45)
    expect(Math.min(...samples.map(row => row.min))).toBe(40)
    expect(Math.max(...samples.map(row => row.max))).toBe(50)
    await expect(pool.query('SELECT kinetiq.refresh_hourly($1,$2)', [from, to])).rejects.toThrow('permission denied')
    await expect(admin.query('SELECT kinetiq.refresh_hourly($1,$1)', [from])).rejects.toThrow('Invalid hourly')
  })
  it('exposes generated OpenAPI for the implemented routes with response schemas', async () => {
    const document = (await get('/v1/openapi.json')).json()
    expect(document.openapi).toBe('3.1.0')
    expect(document.paths['/v1/machines/{id}/telemetry'].get.responses['200']).toBeDefined()
    expect(document.paths['/v1/machines/{id}/series'].get.parameters.some((p: { name: string }) => p.name === 'metric')).toBe(true)
  })
  it('rejects writes even if a browser bypasses disabled controls', async () => {
    const response = await app.inject({ method: 'PUT', url: '/v1/machines/DEMO-CNC-01/settings', payload: {} })
    expect(response.statusCode).toBe(405); expect(response.headers.allow).toBe('GET, HEAD')
  })
  it('keeps liveness up while readiness fails on a database outage', async () => {
    const broken = new Pool({ connectionString: 'postgres://kinetiq_api:test@127.0.0.1:1/kinetiq', connectionTimeoutMillis: 100 })
    const unavailable = await buildApi({ pool: broken, demoOrganizationId: org })
    try {
      expect((await unavailable.inject('/health/live')).statusCode).toBe(200)
      const response = await unavailable.inject('/health/ready'); expect(response.statusCode).toBe(503)
      expect(response.body).not.toContain('postgres://')
    } finally { await unavailable.close(); await broken.end() }
  })
})

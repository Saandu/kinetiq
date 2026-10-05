import { randomUUID } from 'node:crypto'
import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Pool, PoolClient } from 'pg'
import { withTenantTransaction } from '@kinetiq/db'
import { machineIdSchema, machineListSchema, statusListSchema, machineTelemetrySchema, machineSettingsSchema,
  notificationListSchema, maintenanceListSchema, modelSettingsSchema, seriesSchema, healthHistorySchema, problemSchema } from '@kinetiq/contracts'
import * as reads from './read-model.js'

export class ApiProblem extends Error {
  constructor(readonly statusCode: number, message: string) { super(message) }
}
export interface ApiConfig { pool: Pool; demoOrganizationId: string; now?: () => Date; logging?: boolean; closePool?: boolean }

// Phase 0 is an explicit local, read-only identity. No caller-selected tenant.
// Cloud startup/authentication is deliberately unavailable until Cognito is wired.
export async function buildApi(config: ApiConfig) {
  z.uuid().parse(config.demoOrganizationId)
  const app = Fastify({ logger: config.logging ? { redact: ['req.headers.authorization', 'req.headers.cookie'] } : false,
    trustProxy: false, requestIdHeader: false, genReqId: () => randomUUID(), bodyLimit: 5120, requestTimeout: 15_000,
    connectionTimeout: 10_000, keepAliveTimeout: 5_000 }).withTypeProvider<ZodTypeProvider>()
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(swagger, { openapi: { openapi: '3.1.0', info: { title: 'Kinetiq local read API', version: '1.0.0',
    description: 'Phase 0: server-configured read-only demo tenant. Cloud authentication and writes are not enabled.' } }, transform: jsonSchemaTransform })
  const now = config.now ?? (() => new Date())
  const scoped = <T>(action: (client: PoolClient) => Promise<T>) => withTenantTransaction(config.pool, config.demoOrganizationId, async (client) => {
    await client.query('SET TRANSACTION READ ONLY')
    return action(client)
  })
  const machine = <T>(id: string, action: (client: PoolClient) => Promise<T>) => scoped(async (client) => {
    if (!await reads.visibleMachine(client, id)) throw new ApiProblem(404, 'Machine not found')
    return action(client)
  })
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id).header('cache-control', 'no-store').header('x-content-type-options', 'nosniff')
    if (!['GET', 'HEAD'].includes(request.method)) {
      reply.header('allow', 'GET, HEAD'); throw new ApiProblem(405, 'This local API is read-only')
    }
  })
  app.setErrorHandler((error, request, reply) => {
    const status = error instanceof ApiProblem ? error.statusCode : error instanceof Error && 'validation' in error ? 400 : 503
    const title = ({ 400: 'Invalid request', 404: 'Not found', 405: 'Method not allowed', 503: 'Service unavailable' } as Record<number, string>)[status] ?? 'Request failed'
    if (status === 503) request.log.error({ errorName: error instanceof Error ? error.name : 'unknown' }, 'Read request failed')
    reply.status(status).type('application/problem+json').send({ type: 'about:blank', title, status,
      detail: error instanceof ApiProblem ? error.message : status === 400 ? 'Request parameters do not match the API contract' : 'The request could not be completed; retry shortly', requestId: request.id })
  })
  app.setNotFoundHandler(() => { throw new ApiProblem(404, 'Route not found') })
  const errors = { 400: problemSchema, 404: problemSchema, 405: problemSchema, 503: problemSchema }
  const params = z.strictObject({ id: machineIdSchema })
  const empty = z.strictObject({})
  app.get('/v1/machines', { schema: { querystring: empty, response: { 200: machineListSchema, ...errors } } }, () => scoped(reads.listMachines))
  app.get('/v1/machines/status', { schema: { querystring: empty, response: { 200: statusListSchema, ...errors } } }, () => scoped((client) => reads.listStatuses(client, now())))
  app.get('/v1/public/status', { schema: { querystring: empty, response: { 200: statusListSchema, ...errors } } }, () => scoped((client) => reads.listStatuses(client, now())))
  app.get('/v1/machines/:id/telemetry', { schema: { params, querystring: empty, response: { 200: machineTelemetrySchema, ...errors } } },
    (request) => machine(request.params.id, async (client) => { const result = await reads.getTelemetry(client, request.params.id, now()); if (!result) throw new ApiProblem(404, 'Machine not found'); return result }))
  app.get('/v1/machines/:id/settings', { schema: { params, querystring: empty, response: { 200: machineSettingsSchema, ...errors } } },
    (request) => machine(request.params.id, async (client) => { const result = await reads.getSettings(client, request.params.id); if (!result) throw new ApiProblem(404, 'Settings not found'); return result }))
  app.get('/v1/machines/:id/model', { schema: { params, querystring: empty, response: { 200: modelSettingsSchema, ...errors } } },
    (request) => machine(request.params.id, async (client) => { const result = await reads.getModel(client, request.params.id); if (!result) throw new ApiProblem(404, 'Model settings not found'); return result }))
  app.get('/v1/machines/:id/maintenance', { schema: { params, querystring: empty, response: { 200: maintenanceListSchema, ...errors } } },
    (request) => machine(request.params.id, (client) => reads.getMaintenance(client, request.params.id)))
  app.get('/v1/machines/:id/alerts', { schema: { params, querystring: empty, response: { 200: notificationListSchema, ...errors } } },
    (request) => machine(request.params.id, (client) => reads.getAlerts(client, request.params.id)))
  const range = { from: z.iso.datetime(), to: z.iso.datetime() }
  app.get('/v1/machines/:id/series', { schema: { params, querystring: z.strictObject({ ...range,
    metric: z.enum(['temperatureC', 'vibrationMmS', 'spindleRpm', 'powerKw']), bucket: z.enum(['minute', 'hour']) }), response: { 200: seriesSchema, ...errors } } },
    (request) => { const from = new Date(request.query.from); const to = new Date(request.query.to)
      checkRange(from, to, request.query.bucket === 'minute' ? 24 * 60 * 60_000 : 60 * 24 * 60 * 60_000)
      return machine(request.params.id, (client) => reads.getSeries(client, request.params.id, request.query.metric, from, to, request.query.bucket)) })
  app.get('/v1/machines/:id/health', { schema: { params, querystring: z.strictObject(range), response: { 200: healthHistorySchema, ...errors } } },
    (request) => { const from = new Date(request.query.from); const to = new Date(request.query.to); checkRange(from, to, 24 * 60 * 60_000)
      return machine(request.params.id, (client) => reads.getHealth(client, request.params.id, from, to)) })
  const healthy = z.strictObject({ status: z.literal('ok') })
  for (const path of ['/health/live', '/v1/healthz']) app.get(path, { schema: { response: { 200: healthy } } }, () => ({ status: 'ok' as const }))
  for (const path of ['/health/ready', '/v1/readyz']) app.get(path, { schema: { response: { 200: healthy, ...errors } } }, async () => {
    await scoped((client) => client.query('SELECT 1')); return { status: 'ok' as const }
  })
  app.get('/v1/openapi.json', async () => app.swagger())
  if (config.closePool) app.addHook('onClose', async () => { await config.pool.end() })
  await app.ready()
  return app
}
function checkRange(from: Date, to: Date, maximum: number) {
  if (to.getTime() <= from.getTime() || to.getTime() - from.getTime() > maximum) throw new ApiProblem(400, 'Time range is reversed, empty, or exceeds the bucket limit')
}

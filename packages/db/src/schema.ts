import { sql } from 'drizzle-orm'
import { boolean, integer, jsonb, pgSchema, primaryKey, real, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const app = pgSchema('kinetiq')
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const instant = (name: string) => timestamp(name, { withTimezone: true })
const identity = () => uuid('id').primaryKey().defaultRandom()
const org = () => uuid('organization_id').notNull().references(() => organizations.id)
const machine = () => text('machine_id').notNull().references(() => machines.id)

export const organizations = app.table('organizations', {
  id: identity(), name: text('name').notNull(), createdAt: created(),
})
export const sites = app.table('sites', {
  id: identity(), organizationId: org(), name: text('name').notNull(),
  timezone: text('timezone').notNull().default('UTC'), createdAt: created(),
}, (t) => [unique('sites_id_org').on(t.id, t.organizationId)])
export const appUsers = app.table('app_users', {
  id: identity(), organizationId: org(), cognitoSub: text('cognito_sub').notNull().unique(),
  email: text('email').notNull(), displayName: text('display_name').notNull(),
  role: text('role').notNull(), createdAt: created(),
}, (t) => [unique('users_id_org').on(t.id, t.organizationId)])
export const machines = app.table('machines', {
  id: text('id').primaryKey(), organizationId: org(), siteId: uuid('site_id').notNull().references(() => sites.id),
  name: text('name').notNull(), kind: text('kind').notNull(), location: text('location').notNull(),
  hidden: boolean('hidden').notNull().default(false), createdAt: created(),
}, (t) => [unique('machines_id_org').on(t.id, t.organizationId)])
export const devices = app.table('devices', {
  thingName: text('thing_name').primaryKey(), organizationId: org(), machineId: machine().unique(),
  certificateId: text('certificate_id'), lastSeenAt: instant('last_seen_at'), createdAt: created(),
})
export const machineSettings = app.table('machine_settings', {
  machineId: machine().primaryKey(), organizationId: org(), stateNames: text('state_names').array().notNull(),
  watchBelow: real('watch_below').notNull().default(90), warningBelow: real('warning_below').notNull().default(75),
  criticalBelow: real('critical_below').notNull().default(50), updatedBy: uuid('updated_by').references(() => appUsers.id),
  updatedAt: instant('updated_at').notNull().defaultNow(), createdAt: created(),
})
export const modelSettings = app.table('model_settings', {
  machineId: machine().primaryKey(), organizationId: org(), method: text('method').notNull().default('zscore'),
  windowMinutes: integer('window_minutes').notNull().default(30), zscoreThreshold: real('zscore_threshold').notNull().default(3),
  contamination: real('contamination').notNull().default(0.05), minConfidence: real('min_confidence').notNull().default(0.5),
  updatedBy: uuid('updated_by').references(() => appUsers.id), updatedAt: instant('updated_at').notNull().defaultNow(), createdAt: created(),
})
export const machineModes = app.table('machine_modes', {
  machineId: machine().primaryKey(), organizationId: org(), maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  monitoringEnabled: boolean('monitoring_enabled').notNull().default(true), desiredVersion: integer('desired_version').notNull().default(0),
  reportedVersion: integer('reported_version').notNull().default(0), updatedAt: instant('updated_at').notNull().defaultNow(), createdAt: created(),
})
// Range partitioning and RLS are added in the reviewed SQL migrations.
export const telemetry = app.table('telemetry', {
  machineId: machine(), organizationId: org(), ts: instant('ts').notNull(),
  temperatureC: real('temperature_c').notNull(), vibrationMmS: real('vibration_mm_s').notNull(),
  spindleRpm: real('spindle_rpm').notNull(), powerKw: real('power_kw').notNull(),
  stateIndex: smallint('state_index').notNull(), online: boolean('online').notNull(),
  receivedAt: instant('received_at').notNull().defaultNow(), createdAt: created(),
}, (t) => [primaryKey({ columns: [t.machineId, t.ts] })])
export const telemetryHourly = app.table('telemetry_hourly', {
  machineId: machine(), organizationId: org(), hour: instant('hour').notNull(),
  temperatureAvg: real('temperature_avg').notNull(), temperatureMin: real('temperature_min').notNull(), temperatureMax: real('temperature_max').notNull(),
  vibrationAvg: real('vibration_avg').notNull(), vibrationMin: real('vibration_min').notNull(), vibrationMax: real('vibration_max').notNull(),
  spindleAvg: real('spindle_avg').notNull(), spindleMin: real('spindle_min').notNull(), spindleMax: real('spindle_max').notNull(),
  powerAvg: real('power_avg').notNull(), powerMin: real('power_min').notNull(), powerMax: real('power_max').notNull(),
  samples: integer('samples').notNull(), onlineShare: real('online_share').notNull(), stateShare: real('state_share').array().notNull(), createdAt: created(),
}, (t) => [primaryKey({ columns: [t.machineId, t.hour] })])
export const machineHealth = app.table('machine_health', {
  machineId: machine(), organizationId: org(), ts: instant('ts').notNull(), method: text('method').notNull(),
  anomalyScore: real('anomaly_score').notNull(), healthScore: real('health_score').notNull(), confidence: real('confidence').notNull(),
  contributors: jsonb('contributors').notNull(), modelVersion: text('model_version').notNull(), createdAt: created(),
}, (t) => [primaryKey({ columns: [t.machineId, t.ts] })])
export const predictions = app.table('predictions', {
  id: identity(), machineId: machine(), organizationId: org(), computedAt: instant('computed_at').notNull(),
  metric: text('metric').notNull(), threshold: real('threshold').notNull(), eta: instant('eta'),
  slope: real('slope').notNull(), r2: real('r2').notNull(), createdAt: created(),
})
export const alerts = app.table('alerts', {
  id: identity(), machineId: machine(), organizationId: org(), level: smallint('level').notNull(), kind: text('kind').notNull(),
  messageKey: text('message_key').notNull(), value: real('value'), snapshot: jsonb('snapshot').notNull().default(sql`'{}'::jsonb`),
  openedAt: instant('opened_at').notNull().defaultNow(), resolvedAt: instant('resolved_at'), dedupeKey: text('dedupe_key').notNull(), createdAt: created(),
}, (t) => [unique('alerts_id_org').on(t.id, t.organizationId)])
export const alertDismissals = app.table('alert_dismissals', {
  alertId: uuid('alert_id').notNull().references(() => alerts.id), userId: uuid('user_id').notNull().references(() => appUsers.id),
  organizationId: org(), at: instant('at').notNull().defaultNow(), createdAt: created(),
}, (t) => [primaryKey({ columns: [t.alertId, t.userId] })])
export const maintenanceEntries = app.table('maintenance_entries', {
  id: identity(), machineId: machine(), organizationId: org(), category: text('category').notNull(),
  at: instant('at').notNull(), note: text('note'), createdBy: uuid('created_by').notNull().references(() => appUsers.id), createdAt: created(),
})
export const faultEvents = app.table('fault_events', {
  id: identity(), machineId: machine(), organizationId: org(), category: text('category').notNull(),
  startedAt: instant('started_at').notNull(), endedAt: instant('ended_at'), source: text('source').notNull(), createdAt: created(),
})
export const auditLog = app.table('audit_log', {
  id: identity(), organizationId: org(), userId: uuid('user_id').notNull().references(() => appUsers.id),
  action: text('action').notNull(), entity: text('entity').notNull(), entityId: text('entity_id').notNull(),
  payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`), at: instant('at').notNull().defaultNow(), createdAt: created(),
})
export const idempotencyKeys = app.table('idempotency_keys', {
  key: text('key').notNull(), userId: uuid('user_id').notNull().references(() => appUsers.id),
  organizationId: org(), requestHash: text('request_hash').notNull(), response: jsonb('response').notNull(), createdAt: created(),
}, (t) => [primaryKey({ columns: [t.key, t.userId] })])

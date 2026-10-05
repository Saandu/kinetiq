import { z } from 'zod'
import { telemetryMetricsSchema } from './telemetry.js'

export const machineIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/)
export const machineSchema = z.strictObject({ id: machineIdSchema, name: z.string(),
  kind: z.enum(['milling', 'drilling', 'lathe', 'press', 'grinding', 'welding', 'conveyor', 'pump']), location: z.string() })
const percentage = z.number().finite().min(0).max(100)
const share = z.number().finite().min(0).max(1)
const epoch = z.number().int().nonnegative()
export const stateSliceSchema = z.strictObject({ index: z.number().int().min(0).max(7), share })
export const faultCategorySchema = z.enum(['inspection', 'adjustment', 'mechanical', 'electrical', 'lubrication'])
export const faultWindowSchema = z.strictObject({ category: faultCategorySchema, at: epoch, until: epoch.optional(), interval: z.string().optional() })
export const machineStatusSchema = z.strictObject({ id: machineIdSchema, online: z.boolean(), availability: percentage.nullable(),
  alert: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  lastReadingAt: epoch.nullable().optional(), samples: z.number().int().nonnegative().optional() })
const windows = z.strictObject({ previous: faultWindowSchema.nullable(), current: faultWindowSchema.nullable(), next: faultWindowSchema.nullable() })
export const machineTelemetrySchema = z.strictObject({ id: machineIdSchema, online: z.boolean(),
  availability: percentage.nullable(), anomalyScore: percentage.nullable(), confidence: share.nullable(),
  activeStates: z.number().int().min(0).max(8), states: z.array(stateSliceSchema).max(8), currentState: z.number().int().min(0).max(7).nullable(),
  maintenance: windows, faults: windows, maintenanceMode: z.boolean(), monitoringEnabled: z.boolean(),
  latestReading: z.strictObject({ at: epoch, metrics: telemetryMetricsSchema }).nullable().optional(),
  samples: z.number().int().nonnegative().optional(),
})
export const machineSettingsSchema = z.strictObject({ stateNames: z.array(z.string().max(120)).length(8),
  alertThresholds: z.strictObject({ watchBelow: percentage, warningBelow: percentage, criticalBelow: percentage }) })
export const maintenanceEntrySchema = z.strictObject({ id: z.uuid(), machineId: machineIdSchema, category: faultCategorySchema, at: epoch })
export const notificationSnapshotSchema = z.strictObject({ availability: percentage.nullable(), anomalyScore: percentage.nullable(), confidence: share.nullable(),
  activeStates: z.number().int().min(0).max(8), states: z.array(stateSliceSchema).max(8), interval: z.string() })
export const machineNotificationSchema = z.strictObject({ id: z.string(), machineId: machineIdSchema, at: epoch,
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), messageKey: z.string(), value: z.string(),
  tone: z.enum(['good', 'bad']), snapshot: notificationSnapshotSchema.nullable() })
export const machineListSchema = z.array(machineSchema).max(500)
export const statusListSchema = z.array(machineStatusSchema).max(500)
export const notificationListSchema = z.array(machineNotificationSchema).max(100)
export const maintenanceListSchema = z.array(maintenanceEntrySchema).max(100)
export const modelSettingsSchema = z.strictObject({ method: z.enum(['zscore', 'isolation_forest']), windowMinutes: z.number().int(),
  zscoreThreshold: z.number(), contamination: share, minConfidence: share })
export const seriesSchema = z.array(z.strictObject({ at: epoch, avg: z.number(), min: z.number(), max: z.number(), samples: z.number().int().positive() })).max(1440)
export const healthHistorySchema = z.array(z.strictObject({ at: epoch, method: z.enum(['zscore', 'isolation_forest']), anomalyScore: percentage,
  healthScore: percentage, confidence: share, contributors: z.unknown(), modelVersion: z.string() })).max(1440)
export const problemSchema = z.strictObject({ type: z.string(), title: z.string(), status: z.number().int(), detail: z.string(), requestId: z.string() })
export type ApiMachine = z.infer<typeof machineSchema>
export type ApiMachineStatus = z.infer<typeof machineStatusSchema>
export type ApiMachineTelemetry = z.infer<typeof machineTelemetrySchema>
export type ApiMachineNotification = z.infer<typeof machineNotificationSchema>

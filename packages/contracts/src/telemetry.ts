import { z } from 'zod'

export const TELEMETRY_VERSION = 1
export const MAX_READINGS_PER_BATCH = 6
export const MAX_TELEMETRY_BYTES = 5 * 1024

// Upper metric limits depend on a machine's specification, not the wire format.
export const telemetryMetricsSchema = z.strictObject({
  temperatureC: z.number().finite(),
  vibrationMmS: z.number().finite().nonnegative(),
  spindleRpm: z.number().finite().nonnegative(),
  powerKw: z.number().finite().nonnegative(),
})

export const telemetryReadingSchema = z.strictObject({
  ts: z.iso.datetime({ precision: 3 }),
  online: z.boolean(),
  state: z.number().int().min(0).max(7),
  metrics: telemetryMetricsSchema,
})

// Identity is mapped to a tenant using the authenticated device/topic envelope.
// A payload cannot supply an organization or override that trusted identity.
export const telemetryBatchStructureSchema = z.strictObject({
  v: z.literal(TELEMETRY_VERSION),
  machineId: z.string().min(1).max(64).regex(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/),
  seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  readings: z.array(telemetryReadingSchema).min(1).max(MAX_READINGS_PER_BATCH),
})

export const telemetryBatchSchema = telemetryBatchStructureSchema.superRefine((batch, ctx) => {
  for (let index = 1; index < batch.readings.length; index++) {
    const previous = batch.readings[index - 1]!
    const current = batch.readings[index]!
    if (current.ts <= previous.ts) {
      ctx.addIssue({ code: 'custom', path: ['readings', index, 'ts'], message: 'Readings must have strictly increasing timestamps' })
    }
  }
})

export type TelemetryMetrics = z.infer<typeof telemetryMetricsSchema>
export type TelemetryReading = z.infer<typeof telemetryReadingSchema>
export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>

// Check the original UTF-8 body before parsing: whitespace also counts on wire.
export function parseTelemetryMessage(body: string): TelemetryBatch {
  if (new TextEncoder().encode(body).byteLength > MAX_TELEMETRY_BYTES) {
    throw new Error(`Telemetry message exceeds ${MAX_TELEMETRY_BYTES} UTF-8 bytes`)
  }
  return telemetryBatchSchema.parse(JSON.parse(body) as unknown)
}

export const telemetryBatchJsonSchema = z.toJSONSchema(telemetryBatchStructureSchema, {
  target: 'draft-2020-12',
})

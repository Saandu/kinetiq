import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MAX_TELEMETRY_BYTES,
  parseTelemetryMessage,
  telemetryBatchJsonSchema,
  telemetryBatchSchema,
} from '../src/index.js'

const fixture = JSON.parse(readFileSync(new URL('../fixtures/telemetry.v1.json', import.meta.url), 'utf8'))
const invalidCases: { name: string; path: (string | number)[]; value: unknown }[] = JSON.parse(
  readFileSync(new URL('../fixtures/telemetry-cases.v1.json', import.meta.url), 'utf8'),
)

describe('telemetry v1 wire contract', () => {
  it('accepts the documented batch without coercion or field removal', () => {
    expect(parseTelemetryMessage(JSON.stringify(fixture))).toEqual(fixture)
  })

  it.each(invalidCases)('rejects $name', ({ path, value }) => {
    const invalid = structuredClone(fixture)
    let parent = invalid
    for (const key of path.slice(0, -1)) parent = parent[key]
    parent[path.at(-1)!] = value
    expect(telemetryBatchSchema.safeParse(invalid).success).toBe(false)
  })

  it('accepts six readings but rejects a seventh', () => {
    const batch = structuredClone(fixture)
    batch.readings = Array.from({ length: 6 }, (_, index) => ({
      ...fixture.readings[0], ts: `2026-10-03T12:00:${String(index * 10).padStart(2, '0')}.000Z`,
    }))
    expect(telemetryBatchSchema.safeParse(batch).success).toBe(true)
    batch.readings.push({ ...fixture.readings[0], ts: '2026-10-03T12:01:00.000Z' })
    expect(telemetryBatchSchema.safeParse(batch).success).toBe(false)
  })

  it.each([NaN, Infinity, -Infinity])('rejects non-finite temperature %s before serialization', (temperatureC) => {
    const invalid = structuredClone(fixture)
    invalid.readings[0].metrics.temperatureC = temperatureC
    expect(telemetryBatchSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects a missing metric', () => {
    const invalid = structuredClone(fixture)
    delete invalid.readings[0].metrics.powerKw
    expect(telemetryBatchSchema.safeParse(invalid).success).toBe(false)
  })

  it('checks original wire bytes, including whitespace, at the boundary', () => {
    const body = JSON.stringify(fixture)
    const padded = body.padEnd(MAX_TELEMETRY_BYTES, ' ')
    expect(parseTelemetryMessage(padded)).toEqual(fixture)
    expect(() => parseTelemetryMessage(padded + ' ')).toThrow('UTF-8 bytes')
  })

  it('counts multibyte UTF-8 rather than string length', () => {
    expect(() => parseTelemetryMessage('é'.repeat(MAX_TELEMETRY_BYTES / 2 + 1))).toThrow('UTF-8 bytes')
  })

  it('rejects malformed JSON', () => {
    expect(() => parseTelemetryMessage('{')).toThrow()
  })

  it('allows a redelivery of the same batch for downstream idempotent inserts', () => {
    const body = JSON.stringify(fixture)
    expect(parseTelemetryMessage(body)).toEqual(parseTelemetryMessage(body))
  })

  it('keeps the generated language-neutral schema in sync', () => {
    const committed = JSON.parse(readFileSync(new URL('../schema/telemetry-batch.v1.schema.json', import.meta.url), 'utf8'))
    expect(committed).toEqual(telemetryBatchJsonSchema)
  })
})

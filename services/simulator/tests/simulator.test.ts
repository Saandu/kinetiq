import { describe, expect, it } from 'vitest'
import { makeBatch, PublishRateLimit, simulationFleet } from '../src/index.js'

describe('deterministic raw telemetry', () => {
  it('reproduces the same readings and batches six ten-second samples', () => {
    const time = Date.parse('2026-10-05T12:00:00Z')
    const batch = makeBatch('DEMO-CNC-01', time, 1)
    expect(batch).toEqual(makeBatch('DEMO-CNC-01', time, 1))
    expect(batch.readings).toHaveLength(6)
    expect(Date.parse(batch.readings[5]!.ts) - Date.parse(batch.readings[0]!.ts)).toBe(50_000)
    expect(batch.readings).not.toEqual(makeBatch('DEMO-DRL-02', time, 1).readings)
    expect(() => makeBatch('DEMO-CNC-01', time, 1, 7)).toThrow()
  })
  it('caps each device at six messages in any rolling minute', () => {
    const limit = new PublishRateLimit()
    for (let i = 0; i < 6; i++) expect(limit.take(i * 1000)).toBe(true)
    expect(limit.take(59_999)).toBe(false)
    expect(limit.take(60_000)).toBe(true)
    expect(limit.take(60_001)).toBe(false)
  })
  it('preserves the demo identities and expands the test fleet without collisions', () => {
    expect(simulationFleet()).toHaveLength(12)
    const fleet = simulationFleet(500)
    expect(fleet[0]!.id).toBe('DEMO-CNC-01')
    expect(new Set(fleet.map((device) => device.id)).size).toBe(500)
    for (const count of [0, 501, 1.5]) expect(() => simulationFleet(count)).toThrow()
  })
})

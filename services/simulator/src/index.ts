import { createHash } from 'node:crypto'
import { simulationFleet, telemetryBatchSchema, type TelemetryBatch } from '@kinetiq/contracts'

export { simulationFleet }
export const MAX_MESSAGES_PER_MINUTE = 6
export class PublishRateLimit {
  private timestamps: number[] = []
  take(now: number): boolean {
    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < 60_000)
    if (this.timestamps.length >= MAX_MESSAGES_PER_MINUTE) return false
    this.timestamps.push(now)
    return true
  }
}

function profile(id: string) { return createHash('sha256').update(id).digest().readUInt32BE(0) }
export function makeBatch(machineId: string, at: number, seq: number, count = 6): TelemetryBatch {
  if (!Number.isInteger(count) || count < 1 || count > 6) throw new Error('Batch must contain 1..6 readings')
  const seed = profile(machineId)
  const latest = Math.floor(at / 10_000) * 10_000
  return telemetryBatchSchema.parse({ v: 1, machineId, seq, readings: Array.from({ length: count }, (_, index) => {
    const instant = latest - (count - index - 1) * 10_000
    const step = Math.floor(instant / 10_000)
    const state = Math.floor((step + seed % 20) / 12) % 8
    const online = !((seed % 12 === 0) && step % 60 < 6)
    const load = state > 1 && state < 6 ? 0.8 : 0.15
    // Weighted recent loads give temperature a lag rather than instant steps.
    let thermalLoad = 0
    for (let lag = 0; lag < 12; lag++) {
      const previousState = Math.floor((step - lag + seed % 20) / 12) % 8
      thermalLoad += (previousState > 1 && previousState < 6 ? 0.8 : 0.15) * Math.exp(-lag / 4)
    }
    const noise = Math.sin(step * 0.71 + seed % 100) * 0.2
    const unhealthy = seed % 5 === 0 ? 1.8 : 1
    return { ts: new Date(instant).toISOString(), online, state,
      metrics: { temperatureC: 25 + thermalLoad * 8 + seed % 12 + noise,
        vibrationMmS: Math.max(0, (0.6 + load * 2 + noise) * unhealthy),
        spindleRpm: online ? Math.round(load * (5000 + seed % 7000)) : 0,
        powerKw: online ? Math.max(0, load * (4 + seed % 8) + noise) : 0 } }
  }) })
}

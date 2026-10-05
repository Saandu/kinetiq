import { describe, expect, it, vi } from 'vitest'
import { allMachineStatuses, machineTelemetry, machineNotifications } from '../src/services/simulator'
import { reloadTelemetrySource, telemetry } from '../src/services/telemetryService'
import { readJson, writeJson } from '../src/services/storage'
import { useFleetStore } from '../src/stores/fleet'

const id = 'DEMO-CNC-01'
const now = Date.UTC(2026, 8, 5, 12)

describe('simulation and persistence', () => {
  it('reproduces telemetry at a fixed time with normalized state shares', () => {
    const first = machineTelemetry(id, now)
    expect(machineTelemetry(id, now)).toEqual(first)
    expect(first.states.reduce((sum, state) => sum + state.share, 0)).toBeCloseTo(1, 10)
    expect(first.states.every((state) => state.share >= 0 && state.share <= 1)).toBe(true)
  })

  it('keeps a useful healthy, watch, warning, critical and offline fleet over time', () => {
    for (let minute = 0; minute < 120; minute++) {
      const statuses = allMachineStatuses(now + minute * 60_000)
      expect(new Set(statuses.map((s) => s.alert))).toEqual(new Set([0, 1, 2, 3]))
      expect(statuses.filter((s) => !s.online)).toHaveLength(1)
      expect(statuses.every((s) => s.availability >= 0 && s.availability <= 100)).toBe(true)
    }
  })

  it('keeps notification identities stable within a time bucket and orders history', () => {
    const items = machineNotifications(id, now)
    expect(machineNotifications(id, now + 2000)).toEqual(items)
    expect(items.every((item, i) => item.at <= now && (i === 0 || items[i - 1].at >= item.at))).toBe(true)
  })

  it('persists removal, dismissal, modes and maintenance across reloads', () => {
    const notification = telemetry().listNotifications(id, now)[0]
    telemetry().dismissNotification(notification.id)
    telemetry().setMaintenanceMode(id, true)
    telemetry().addMaintenanceEntry(id, 'inspection', now)
    telemetry().removeMachine('DEMO-PMP-08')
    reloadTelemetrySource()
    expect(telemetry().getTelemetry(id, now)?.maintenanceMode).toBe(true)
    expect(telemetry().listNotifications(id, now).some((n) => n.id === notification.id)).toBe(false)
    expect(telemetry().listMaintenanceEntries(id)).toHaveLength(1)
    expect(telemetry().getTelemetry('DEMO-PMP-08', now)).toBeNull()
  })

  it('recovers from malformed storage without losing the demo roster', () => {
    localStorage.setItem('kinetiq.demo.v1.overrides', '{broken')
    reloadTelemetrySource()
    expect(telemetry().listMachines()).toHaveLength(8)
    writeJson('overrides', { hiddenMachines: 42, entries: [null], settings: { [id]: { stateNames: false } } })
    reloadTelemetrySource()
    expect(telemetry().listMachines()).toHaveLength(8)
    expect(telemetry().getSettings(id).stateNames).toHaveLength(8)
    expect(telemetry().listMaintenanceEntries(id)).toEqual([])
  })

  it('keeps working when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readJson('anything', 'fallback')).toBe('fallback')
    expect(() => writeJson('anything', {})).not.toThrow()
    reloadTelemetrySource()
    expect(telemetry().listMachines()).toHaveLength(8)
  })

  it('resets only demo storage and restores all eight machines', () => {
    localStorage.setItem('unrelated-app', 'keep')
    telemetry().removeMachine(id)
    useFleetStore().resetDemo()
    expect(telemetry().listMachines()).toHaveLength(8)
    expect(localStorage.getItem('unrelated-app')).toBe('keep')
  })
})

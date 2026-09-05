import { describe, expect, it } from 'vitest'
import { useSettingsStore } from '../src/stores/settings'
import { useFleetStore } from '../src/stores/fleet'
import { telemetry } from '../src/services/telemetryService'

const id = 'DEMO-PMP-08'

describe('settings save boundaries', () => {
  it('saves state names without applying an unsaved alert draft', () => {
    const settings = useSettingsStore()
    settings.load(id)
    settings.draft.stateNames[0] = 'Cooling'
    settings.draft.alertThresholds = { watchBelow: 40, warningBelow: 30, criticalBelow: 20 }
    settings.saveStates()
    expect(telemetry().getSettings(id).stateNames[0]).toBe('Cooling')
    expect(telemetry().getSettings(id).alertThresholds.watchBelow).toBe(90)
  })

  it('saves alerts without applying unsaved state names', () => {
    const settings = useSettingsStore()
    settings.load(id)
    settings.draft.stateNames[0] = 'Unsaved label'
    settings.draft.alertThresholds = { watchBelow: 40, warningBelow: 30, criticalBelow: 20 }
    expect(settings.saveAlertThresholds()).toBe(true)
    expect(telemetry().getSettings(id).stateNames[0]).toBe('')
    expect(telemetry().getSettings(id).alertThresholds.watchBelow).toBe(40)
  })

  it.each([NaN, Infinity, -1, 101, 80])('rejects invalid watch threshold %s without changing saved values', (value) => {
    const settings = useSettingsStore()
    settings.load(id)
    settings.draft.alertThresholds.watchBelow = value
    expect(settings.saveAlertThresholds()).toBe(false)
    expect(telemetry().getSettings(id).alertThresholds.watchBelow).toBe(90)
  })

  it('updates an already-computed fleet status immediately after saving', () => {
    const fleet = useFleetStore()
    const settings = useSettingsStore()
    expect(fleet.statuses.find((s) => s.id === id)?.alert).toBe(3)
    settings.load(id)
    settings.draft.alertThresholds = { watchBelow: 40, warningBelow: 30, criticalBelow: 20 }
    settings.saveAlertThresholds()
    expect(fleet.statuses.find((s) => s.id === id)?.alert).toBe(0)
  })

  it('discards unsaved edits when switching machines and isolates saved settings', () => {
    const settings = useSettingsStore()
    settings.load(id)
    settings.draft.stateNames[0] = 'Saved pump state'
    settings.saveStates()
    settings.draft.stateNames[0] = 'Unsaved'
    settings.load('DEMO-CNC-01')
    expect(settings.draft.stateNames[0]).toBe('')
    settings.load(id)
    expect(settings.draft.stateNames[0]).toBe('Saved pump state')
  })
})

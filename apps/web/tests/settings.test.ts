import { describe, expect, it } from 'vitest'
import { useSettingsStore } from '../src/stores/settings'
import { useFleetStore } from '../src/stores/fleet'
import { telemetry } from '../src/services/telemetryService'

const id = 'DEMO-PMP-08'

describe('settings save boundaries', () => {
  it('saves state names without applying an unsaved alert draft', async () => {
    const settings = useSettingsStore()
    await settings.load(id)
    settings.draft.stateNames[0] = 'Cooling'
    settings.draft.alertThresholds = { watchBelow: 40, warningBelow: 30, criticalBelow: 20 }
    await settings.saveStates()
    expect((await telemetry().getSettings(id)).stateNames[0]).toBe('Cooling')
    expect((await telemetry().getSettings(id)).alertThresholds.watchBelow).toBe(90)
  })

  it('saves alerts without applying unsaved state names', async () => {
    const settings = useSettingsStore()
    await settings.load(id)
    settings.draft.stateNames[0] = 'Unsaved label'
    settings.draft.alertThresholds = { watchBelow: 40, warningBelow: 30, criticalBelow: 20 }
    expect(await settings.saveAlertThresholds()).toBe(true)
    expect((await telemetry().getSettings(id)).stateNames[0]).toBe('')
    expect((await telemetry().getSettings(id)).alertThresholds.watchBelow).toBe(40)
  })

  it.each([NaN, Infinity, -1, 101, 80])('rejects invalid watch threshold %s without changing saved values', async (value) => {
    const settings = useSettingsStore()
    await settings.load(id)
    settings.draft.alertThresholds.watchBelow = value
    expect(await settings.saveAlertThresholds()).toBe(false)
    expect((await telemetry().getSettings(id)).alertThresholds.watchBelow).toBe(90)
  })

  it('updates an already-computed fleet status immediately after saving', async () => {
    const fleet = useFleetStore()
    const settings = useSettingsStore()
    expect(fleet.statuses.find((s) => s.id === id)?.alert).toBe(3)
    await settings.load(id)
    settings.draft.alertThresholds = { watchBelow: 40, warningBelow: 30, criticalBelow: 20 }
    await settings.saveAlertThresholds()
    expect(fleet.statuses.find((s) => s.id === id)?.alert).toBe(0)
  })

  it('discards unsaved edits when switching machines and isolates saved settings', async () => {
    const settings = useSettingsStore()
    await settings.load(id)
    settings.draft.stateNames[0] = 'Saved pump state'
    await settings.saveStates()
    settings.draft.stateNames[0] = 'Unsaved'
    await settings.load('DEMO-CNC-01')
    expect(settings.draft.stateNames[0]).toBe('')
    await settings.load(id)
    expect(settings.draft.stateNames[0]).toBe('Saved pump state')
  })
})

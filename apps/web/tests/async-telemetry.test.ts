import { expect, it, vi } from 'vitest'
import { disposePinia, getActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useFleetStore } from '../src/stores/fleet'
import { useSettingsStore } from '../src/stores/settings'
import { defaultSettings, setTelemetrySource, telemetry } from '../src/services/telemetryService'
import { machineTelemetry } from '../src/services/simulator'
import { i18n } from '../src/i18n'
import { useUiStore } from '../src/stores/ui'
import SettingsPage from '../src/pages/SettingsPage.vue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it('discards an old machine response after navigation', async () => {
  const adapter = telemetry()
  const old = deferred<ReturnType<typeof machineTelemetry>>()
  const read = vi.spyOn(adapter, 'getTelemetry')
    .mockImplementationOnce(() => old.promise)
    .mockResolvedValueOnce(machineTelemetry('DEMO-PMP-08'))
  const fleet = useFleetStore()
  const first = fleet.select('DEMO-CNC-01')
  expect(fleet.selectedLoading).toBe(true)
  expect(fleet.selectedTelemetry).toBeNull()
  await fleet.select('DEMO-PMP-08')
  old.resolve(machineTelemetry('DEMO-CNC-01'))
  await first
  expect(read).toHaveBeenCalledTimes(2)
  expect(fleet.selectedTelemetry?.id).toBe('DEMO-PMP-08')
  expect(fleet.selectedLoading).toBe(false)
})

it('keeps the last successful fleet snapshot on failure and recovers on retry', async () => {
  const fleet = useFleetStore()
  const previous = fleet.statuses
  const read = vi.spyOn(telemetry(), 'listStatuses').mockRejectedValueOnce(new Error('offline'))
  expect(await fleet.refresh()).toBe(false)
  expect(fleet.fleetError).toBe(true)
  expect(fleet.statuses).toEqual(previous)
  expect(fleet.loading).toBe(false)
  read.mockRestore()
  expect(await fleet.refresh()).toBe(true)
  expect(fleet.error).toBe(false)
})

it('rejects late responses after switching adapters', async () => {
  const original = telemetry()
  const response = deferred<Awaited<ReturnType<typeof original.listMachines>>>()
  vi.spyOn(original, 'listMachines').mockReturnValue(response.promise)
  const fleet = useFleetStore()
  const pending = fleet.loadFleet()
  // A real adapter swap is a new request; the previous adapter cannot win.
  const replacement = Object.create(original) as typeof original
  replacement.listMachines = async () => []
  replacement.listStatuses = async () => []
  setTelemetrySource(replacement)
  await fleet.loadFleet()
  response.resolve([{ id: 'old', name: 'Old', kind: 'pump', location: 'Old' }])
  await pending
  expect(fleet.machines).toEqual([])
})

it('waits for persistence, blocks duplicate writes and leaves state intact on failure', async () => {
  const fleet = useFleetStore()
  await fleet.select('DEMO-CNC-01')
  const pending = deferred<void>()
  const write = vi.spyOn(telemetry(), 'setMaintenanceMode').mockReturnValue(pending.promise)
  const result = fleet.setMaintenanceMode(true)
  expect(fleet.writing).toBe(true)
  expect(fleet.selectedTelemetry?.maintenanceMode).toBe(false)
  expect(await fleet.setMaintenanceMode(true)).toBe(false)
  pending.reject(new Error('write failed'))
  expect(await result).toBe(false)
  expect(write).toHaveBeenCalledTimes(1)
  expect(fleet.selectedTelemetry?.maintenanceMode).toBe(false)
  expect(fleet.writeError).toBe(true)
  expect(fleet.writing).toBe(false)
})

it('does not overlap polling requests and cleans up the timer on store disposal', async () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const pending = deferred<Awaited<ReturnType<ReturnType<typeof telemetry>['listStatuses']>>>()
  const read = vi.spyOn(telemetry(), 'listStatuses').mockReturnValue(pending.promise)
  const fleet = useFleetStore()
  fleet.subscribe()
  await vi.advanceTimersByTimeAsync(10_000)
  expect(read).toHaveBeenCalledTimes(1)
  const previous = fleet.statuses
  disposePinia(getActivePinia()!)
  expect(vi.getTimerCount()).toBe(0)
  pending.resolve([])
  await Promise.resolve()
  await Promise.resolve()
  expect(fleet.statuses).toEqual(previous)
})

it('discards settings loaded for the previously selected machine', async () => {
  const pending = deferred<ReturnType<typeof defaultSettings>>()
  const stale = defaultSettings()
  stale.stateNames[0] = 'Old machine'
  vi.spyOn(telemetry(), 'getSettings').mockReturnValueOnce(pending.promise)
  const settings = useSettingsStore()
  const first = settings.load('DEMO-CNC-01')
  expect(settings.ready).toBe(false)
  expect(await settings.saveStates()).toBe(false)
  await settings.load('DEMO-PMP-08')
  pending.resolve(stale)
  await first
  expect(settings.machineId).toBe('DEMO-PMP-08')
  expect(settings.draft.stateNames[0]).toBe('')
  expect(settings.ready).toBe(true)
})

it('retains an unsaved settings draft when persistence fails', async () => {
  const settings = useSettingsStore()
  await settings.load('DEMO-CNC-01')
  settings.draft.stateNames[0] = 'Keep my draft'
  vi.spyOn(telemetry(), 'saveSettings').mockRejectedValue(new Error('offline'))
  expect(await settings.saveStates()).toBe(false)
  expect(settings.draft.stateNames[0]).toBe('Keep my draft')
  expect(settings.error).toBe('save')
  expect(settings.saving).toBe(false)
})

it('shows a settings load failure and never reports a rejected save as successful', async () => {
  const fleet = useFleetStore()
  await fleet.select('DEMO-CNC-01')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: SettingsPage }] })
  await router.push('/')
  const settings = useSettingsStore()
  const wrapper = mount(SettingsPage, { global: { plugins: [getActivePinia()!, router, i18n] } })
  await vi.waitFor(() => expect(settings.ready).toBe(true))
  vi.spyOn(telemetry(), 'saveSettings').mockRejectedValue(new Error('offline'))
  await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
  expect(useUiStore().toasts.some((toast) => toast.tone === 'good')).toBe(false)
  const load = vi.spyOn(telemetry(), 'getSettings').mockRejectedValue(new Error('offline'))
  await settings.load('DEMO-CNC-01')
  expect(settings.error).toBe('load')
  expect(settings.ready).toBe(false)
  load.mockRestore()
  await settings.load('DEMO-CNC-01')
  expect(settings.error).toBeNull()
  expect(settings.ready).toBe(true)
  wrapper.unmount()
})

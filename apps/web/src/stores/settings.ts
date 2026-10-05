import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'
import { useFleetStore } from './fleet'
import { telemetry as source, defaultSettings } from '@/services/telemetryService'
import type { MachineSettings } from '@/types/telemetry'

/** A draft is editable only after its own machine's settings have loaded. */
export const useSettingsStore = defineStore('settings', () => {
  const machineId = ref('')
  const draft = ref<MachineSettings>(defaultSettings())
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<'load' | 'save' | null>(null)
  const ready = ref(false)
  let request = 0
  let disposed = false
  onScopeDispose(() => { disposed = true; request++ })

  async function load(id: string): Promise<boolean> {
    const current = ++request
    machineId.value = id
    draft.value = defaultSettings()
    ready.value = false
    error.value = null
    loading.value = Boolean(id)
    if (!id) return true
    const adapter = source()
    try {
      const settings = await adapter.getSettings(id)
      if (disposed || current !== request || adapter !== source()) return false
      draft.value = structuredClone(settings)
      ready.value = true
      return true
    } catch {
      if (!disposed && current === request) error.value = 'load'
      return false
    } finally {
      if (!disposed && current === request) loading.value = false
    }
  }

  async function save(panel: 'states' | 'alerts'): Promise<boolean> {
    if (!machineId.value || !ready.value || loading.value || saving.value || disposed) return false
    if (panel === 'alerts' && !validThresholds(draft.value.alertThresholds)) return false
    const id = machineId.value
    const current = request
    const adapter = source()
    const names = [...draft.value.stateNames]
    const thresholds = { ...draft.value.alertThresholds }
    saving.value = true
    error.value = null
    try {
      const saved = await adapter.getSettings(id)
      await adapter.saveSettings(id, panel === 'states'
        ? { ...saved, stateNames: names }
        : { ...saved, alertThresholds: thresholds })
      if (disposed || current !== request || adapter !== source()) return false
      await useFleetStore().refresh()
      return true
    } catch {
      if (!disposed && current === request) error.value = 'save'
      return false
    } finally {
      if (!disposed) saving.value = false
    }
  }
  function saveStates() { return save('states') }
  function saveAlertThresholds() { return save('alerts') }
  function reset() {
    request++
    machineId.value = ''
    draft.value = defaultSettings()
    ready.value = false
    loading.value = false
    error.value = null
  }
  return { machineId, draft, loading, saving, ready, error, load, saveStates, saveAlertThresholds, reset }
})

export function validThresholds(value: MachineSettings['alertThresholds']): boolean {
  return Object.values(value).every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100)
    && value.criticalBelow < value.warningBelow && value.warningBelow < value.watchBelow
}

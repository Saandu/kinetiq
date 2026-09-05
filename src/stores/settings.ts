import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useFleetStore } from './fleet'
import { telemetry as source, defaultSettings } from '@/services/telemetryService'
import type { MachineSettings } from '@/types/telemetry'

/**
 * Settings are edited as a local draft and only committed on save, so a
 * half-typed number never reaches storage and the form can be abandoned
 * by navigating away.
 */
export const useSettingsStore = defineStore('settings', () => {
  const machineId = ref('')
  const draft = ref<MachineSettings>(defaultSettings())

  function load(id: string) {
    machineId.value = id
    draft.value = id ? source().getSettings(id) : defaultSettings()
  }

  function saveStates() {
    if (!machineId.value) return
    source().saveSettings(machineId.value, {
      ...source().getSettings(machineId.value),
      stateNames: [...draft.value.stateNames],
    })
    useFleetStore().refresh()
  }

  function saveAlertThresholds(): boolean {
    if (!machineId.value) return false
    const thresholds = draft.value.alertThresholds
    if (!validThresholds(thresholds)) return false
    source().saveSettings(machineId.value, {
      ...source().getSettings(machineId.value),
      alertThresholds: { ...thresholds },
    })
    useFleetStore().refresh()
    return true
  }

  function reset() {
    draft.value = defaultSettings()
  }

  return { machineId, draft, load, saveStates, saveAlertThresholds, reset }
})

export function validThresholds(value: MachineSettings['alertThresholds']): boolean {
  return Object.values(value).every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100)
    && value.criticalBelow < value.warningBelow && value.warningBelow < value.watchBelow
}

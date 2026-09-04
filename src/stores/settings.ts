import { defineStore } from 'pinia'
import { ref } from 'vue'
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
    source().saveSettings(machineId.value, toPlain(draft.value))
  }

  /** Both panels commit the same draft; separate buttons keep actions local. */
  const saveAlertThresholds = saveStates

  function reset() {
    draft.value = defaultSettings()
  }

  return { machineId, draft, load, saveStates, saveAlertThresholds, reset }
})

/** structuredClone chokes on reactive proxies in some browsers. */
function toPlain(value: MachineSettings): MachineSettings {
  return JSON.parse(JSON.stringify(value)) as MachineSettings
}

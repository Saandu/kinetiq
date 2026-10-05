import { computed, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { telemetry } from '@/services/telemetryService'
import { MAX_STATES } from '@/services/simulator'

/**
 * Resolves the display name for each operating state.
 *
 * A name the user typed in Settings wins and is shown verbatim in both
 * languages. Anything not renamed falls back to the translated demo default.
 */
export function useStateLabels(machineId: Ref<string>, revision?: Ref<number>) {
  const { t } = useI18n()

  return computed(() => {
    void revision?.value
    const custom = machineId.value ? telemetry().getSettings(machineId.value).stateNames : []

    return Array.from({ length: MAX_STATES }, (_, i) => {
      const override = custom[i]?.trim()
      return override || t(`states.default.${i + 1}`)
    })
  })
}

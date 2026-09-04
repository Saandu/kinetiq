<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import PageBody from '@/components/layout/PageBody.vue'
import KButton from '@/components/ui/KButton.vue'
import KCard from '@/components/ui/KCard.vue'
import KField from '@/components/ui/KField.vue'
import KInput from '@/components/ui/KInput.vue'
import { MAX_STATES } from '@/services/simulator'
import { useFleetStore } from '@/stores/fleet'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const fleet = useFleetStore()
const settings = useSettingsStore()
const ui = useUiStore()

settings.load(fleet.selectedId)
watch(() => fleet.selectedId, (id) => settings.load(id))

const stateSlots = computed(() => Array.from({ length: MAX_STATES }, (_, i) => i))

const alertFields = [
  { key: 'watchBelow' },
  { key: 'warningBelow' },
  { key: 'criticalBelow' },
] as const

const alertThresholdsValid = computed(() => {
  const { watchBelow, warningBelow, criticalBelow } = settings.draft.alertThresholds
  return (
    [watchBelow, warningBelow, criticalBelow].every(
      (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100
    ) &&
    Number(criticalBelow) < Number(warningBelow) &&
    Number(warningBelow) < Number(watchBelow)
  )
})

function save(which: 'states' | 'alerts') {
  if (which === 'alerts' && !alertThresholdsValid.value) {
    ui.notify(t('settings.invalidThresholds'), 'bad')
    return
  }

  if (which === 'states') settings.saveStates()
  else settings.saveAlertThresholds()
  ui.notify(t('settings.saved'), 'good')
}
</script>

<template>
  <div>
    <AppTopbar
      :title="t('settings.title')"
      :subtitle="t('settings.subtitle', { machine: fleet.selectedId })"
    />

    <PageBody>
      <!-- state labels -->
      <KCard :title="t('settings.stateDescription')" :hint="t('settings.stateDescriptionHint')">
        <template #actions>
          <KButton size="sm" variant="primary" @click="save('states')">
            {{ t('actions.save') }}
          </KButton>
        </template>

        <div class="grid grid--states">
          <KField
            v-for="i in stateSlots"
            :key="i"
            v-slot="{ id }"
            :label="t('settings.stateN', { n: i + 1 })"
          >
            <KInput
              :id="id"
              v-model="settings.draft.stateNames[i]"
              :placeholder="t('states.default.' + (i + 1))"
            />
          </KField>
        </div>

      </KCard>

      <!-- alert thresholds -->
      <KCard :title="t('settings.alertSettings')" :hint="t('settings.alertSettingsHint')">
        <template #actions>
          <KButton size="sm" variant="primary" @click="save('alerts')">
            {{ t('actions.save') }}
          </KButton>
        </template>

        <div class="grid">
          <KField
            v-for="field in alertFields"
            :key="field.key"
            v-slot="{ id }"
            :label="t(`settings.fields.${field.key}`)"
          >
            <KInput
              :id="id"
              v-model.number="settings.draft.alertThresholds[field.key]"
              type="number"
              min="0"
              max="100"
              step="1"
            />
          </KField>
        </div>

        <p class="risk" :class="alertThresholdsValid ? 'risk--low' : 'risk--high'">
          {{ t(alertThresholdsValid ? 'settings.thresholdsValid' : 'settings.invalidThresholds') }}
        </p>
      </KCard>

      <!-- demo controls -->
      <KCard :title="t('demo.badge')" :hint="t('demo.notice')">
        <KButton
          @click="
            () => {
              fleet.resetDemo()
              settings.reset()
              ui.notify(t('demo.resetDone'), 'neutral')
            }
          "
        >
          {{ t('demo.reset') }}
        </KButton>
      </KCard>
    </PageBody>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: var(--s-4);
}

.grid--states {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.risk {
  margin-top: var(--s-5);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-sm);
  border-left: 3px solid;
  font-size: var(--t-sm);
  line-height: 1.5;
}

.risk--low {
  background: var(--c-green-soft);
  border-color: var(--c-green);
  color: var(--text);
}

.risk--high {
  background: var(--c-red-soft);
  border-color: var(--c-red);
  color: var(--text);
}
</style>

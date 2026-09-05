<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import PageBody from '@/components/layout/PageBody.vue'
import KStateBar from '@/components/charts/KStateBar.vue'
import KBadge from '@/components/ui/KBadge.vue'
import KButton from '@/components/ui/KButton.vue'
import KCard from '@/components/ui/KCard.vue'
import KEmptyState from '@/components/ui/KEmptyState.vue'
import KField from '@/components/ui/KField.vue'
import KInput from '@/components/ui/KInput.vue'
import KSelect from '@/components/ui/KSelect.vue'
import KStatTile from '@/components/ui/KStatTile.vue'
import KSwitch from '@/components/ui/KSwitch.vue'
import { useFormat } from '@/composables/useFormat'
import { useStateLabels } from '@/composables/useStateLabels'
import { useFleetStore } from '@/stores/fleet'
import { useUiStore } from '@/stores/ui'
import { FAULT_CATEGORIES, type FaultCategory, type FaultWindow } from '@/types/telemetry'

const { t } = useI18n()
const fleet = useFleetStore()
const ui = useUiStore()
const { formatDateTime, percent } = useFormat()

const stateLabels = useStateLabels(toRef(fleet, 'selectedId'))

const telemetry = computed(() => fleet.selectedTelemetry)
const machine = computed(() => fleet.selectedMachine)

const categoryOptions = computed(() =>
  FAULT_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))
)

/* ---- maintenance log form ---------------------------------------- */

const entryDate = ref('')
const entryTime = ref('')
const entryCategory = ref('')

function addEntry() {
  if (!entryDate.value || !entryTime.value || !entryCategory.value) {
    ui.notify(t('machine.entryFailed'), 'bad')
    return
  }
  const at = new Date(`${entryDate.value}T${entryTime.value}`).getTime()
  if (Number.isNaN(at)) {
    ui.notify(t('machine.entryFailed'), 'bad')
    return
  }
  if (at > Date.now()) {
    ui.notify(t('machine.entryFuture'), 'bad')
    return
  }
  fleet.addMaintenanceEntry(entryCategory.value as FaultCategory, at)
  entryDate.value = ''
  entryTime.value = ''
  entryCategory.value = ''
  ui.notify(t('machine.entryAdded'), 'good')
}

/* ---- control unit ------------------------------------------------- */

const maintenanceMode = computed({
  get: () => telemetry.value?.maintenanceMode ?? false,
  set: (on: boolean) => {
    fleet.setMaintenanceMode(on)
    ui.notify(
      t(on ? 'machine.modeOn' : 'machine.modeOff', { mode: t('machine.maintenanceMode') }),
      on ? 'good' : 'neutral'
    )
  },
})

const monitoringEnabled = computed({
  get: () => telemetry.value?.monitoringEnabled ?? false,
  set: (on: boolean) => {
    fleet.setMonitoringEnabled(on)
    ui.notify(
      t(on ? 'machine.modeOn' : 'machine.modeOff', { mode: t('machine.monitoringEnabled') }),
      on ? 'good' : 'neutral'
    )
  },
})

function windowLabel(w: FaultWindow) {
  return t(`category.${w.category}`)
}
</script>

<template>
  <div>
    <AppTopbar
      :title="machine?.id ?? t('nav.machine')"
      :subtitle="machine ? `${machine.name} · ${machine.location}` : undefined"
    >
      <template #actions>
        <KBadge v-if="telemetry" :tone="telemetry.online ? 'good' : 'bad'" dot>
          {{ telemetry.online ? t('status.online') : t('status.offline') }}
        </KBadge>
      </template>
    </AppTopbar>

    <PageBody>
      <KCard v-if="!telemetry" :padded="false">
        <KEmptyState :title="t('machine.notFound.title')" :body="t('machine.notFound.body')">
          <RouterLink to="/"><KButton variant="primary">{{ t('actions.back') }}</KButton></RouterLink>
        </KEmptyState>
      </KCard>

      <template v-else>
        <!-- headline condition numbers -->
        <div class="kpis">
          <KCard>
            <KStatTile
              :label="t('metrics.availability')"
              :value="percent(telemetry.availability, 1)"
              :percent="telemetry.availability"
              size="lg"
            />
          </KCard>
          <KCard>
            <KStatTile
              :label="t('metrics.anomalyScore')"
              :value="percent(telemetry.anomalyScore, 1)"
              :percent="telemetry.anomalyScore"
              tone="info"
              size="lg"
            />
          </KCard>
          <KCard>
            <KStatTile
              :label="t('metrics.confidence')"
              :value="percent(telemetry.confidence * 100, 1)"
              :percent="telemetry.confidence * 100"
              tone="good"
              size="lg"
            />
          </KCard>
          <KCard>
            <KStatTile
              :label="t('metrics.currentState')"
              :value="stateLabels[telemetry.currentState] ?? '—'"
              :hint="t('metrics.statesTracked', { n: telemetry.activeStates })"
              size="md"
            />
          </KCard>
        </div>

        <KCard :title="t('machine.stateAnalysis')" :hint="t('machine.stateAnalysisHint')">
          <KStateBar
            :slices="telemetry.states"
            :labels="stateLabels"
            :current-state="telemetry.currentState"
          />
        </KCard>

        <div class="split">
          <KCard class="monitor-card" :title="t('machine.maintenanceMonitoring')">
            <div class="windows">
              <div class="windows__col">
                <p class="windows__head">{{ t('machine.previousMaintenance') }}</p>
                <div class="win">
                  <span class="win__cat">{{ windowLabel(telemetry.maintenance.previous) }}</span>
                  <span class="win__time tnum">
                    {{ formatDateTime(telemetry.maintenance.previous.at) }}
                  </span>
                  <KBadge tone="neutral">{{ telemetry.maintenance.previous.interval }}</KBadge>
                </div>
                <div class="win">
                  <span class="win__cat">{{ windowLabel(telemetry.maintenance.current) }}</span>
                  <span class="win__time tnum">
                    {{ formatDateTime(telemetry.maintenance.current.at) }}
                  </span>
                  <KBadge tone="neutral">{{ telemetry.maintenance.current.interval }}</KBadge>
                </div>
              </div>

              <div class="windows__col">
                <p class="windows__head">{{ t('machine.nextMaintenance') }}</p>
                <div class="win win--next">
                  <span class="win__cat">{{ windowLabel(telemetry.maintenance.next) }}</span>
                  <span class="win__time tnum">
                    {{ formatDateTime(telemetry.maintenance.next.at) }}
                    <template v-if="telemetry.maintenance.next.until">
                      → {{ formatDateTime(telemetry.maintenance.next.until) }}
                    </template>
                  </span>
                  <KBadge tone="info">{{ t('machine.predicted') }}</KBadge>
                </div>
              </div>
            </div>
          </KCard>

          <KCard class="monitor-card" :title="t('machine.faultMonitoring')">
            <div class="windows">
              <div class="windows__col">
                <p class="windows__head">{{ t('machine.previousFault') }}</p>
                <div class="win">
                  <span class="win__cat">{{ windowLabel(telemetry.faults.previous) }}</span>
                  <span class="win__time tnum">
                    {{ formatDateTime(telemetry.faults.previous.at) }}
                  </span>
                  <KBadge tone="neutral">{{ telemetry.faults.previous.interval }}</KBadge>
                </div>
                <div class="win">
                  <span class="win__cat">{{ windowLabel(telemetry.faults.current) }}</span>
                  <span class="win__time tnum">
                    {{ formatDateTime(telemetry.faults.current.at) }}
                  </span>
                  <KBadge tone="neutral">{{ telemetry.faults.current.interval }}</KBadge>
                </div>
              </div>

              <div class="windows__col">
                <p class="windows__head">{{ t('machine.nextFault') }}</p>
                <div class="win win--next">
                  <span class="win__cat">{{ windowLabel(telemetry.faults.next) }}</span>
                  <span class="win__time tnum">
                    {{ formatDateTime(telemetry.faults.next.at) }}
                    <template v-if="telemetry.faults.next.until">
                      → {{ formatDateTime(telemetry.faults.next.until) }}
                    </template>
                  </span>
                  <KBadge tone="warn">{{ t('machine.predicted') }}</KBadge>
                </div>
              </div>
            </div>
          </KCard>
        </div>

        <div class="split">
          <KCard
            class="action-card"
            :title="t('machine.maintenancePanel')"
            :hint="t('machine.maintenancePanelHint')"
          >
            <form class="logform" @submit.prevent="addEntry">
              <KField v-slot="{ id }" :label="t('machine.date')">
                <KInput :id="id" v-model="entryDate" type="date" />
              </KField>
              <KField v-slot="{ id }" :label="t('machine.time')">
                <KInput :id="id" v-model="entryTime" type="time" />
              </KField>
              <KField v-slot="{ id }" :label="t('machine.category')">
                <KSelect
                  :id="id"
                  v-model="entryCategory"
                  :options="categoryOptions"
                  :placeholder="t('machine.chooseCategory')"
                />
              </KField>
              <KButton type="submit" variant="primary">{{ t('actions.add') }}</KButton>
            </form>

            <div class="log">
              <p class="log__head">{{ t('machine.loggedEntries') }}</p>
              <p v-if="!fleet.maintenanceEntries.length" class="log__empty">
                {{ t('machine.noEntries') }}
              </p>
              <ul v-else class="log__list">
                <li v-for="entry in fleet.maintenanceEntries" :key="entry.id" class="log__item">
                  <span class="log__cat">{{ t(`category.${entry.category}`) }}</span>
                  <span class="log__time tnum">{{ formatDateTime(entry.at) }}</span>
                </li>
              </ul>
            </div>
          </KCard>

          <KCard class="action-card" :title="t('machine.controlUnit')">
            <div class="modes">
              <div class="mode">
                <div>
                  <p class="mode__name">{{ t('machine.maintenanceMode') }}</p>
                  <p class="mode__state">
                    {{ maintenanceMode ? t('metrics.active') : t('metrics.inactive') }}
                  </p>
                </div>
                <KSwitch v-model="maintenanceMode" :label="t('machine.maintenanceMode')" />
              </div>

              <div class="mode">
                <div>
                  <p class="mode__name">{{ t('machine.monitoringEnabled') }}</p>
                  <p class="mode__state">
                    {{ monitoringEnabled ? t('metrics.active') : t('metrics.inactive') }}
                  </p>
                </div>
                <KSwitch v-model="monitoringEnabled" :label="t('machine.monitoringEnabled')" />
              </div>
            </div>
          </KCard>
        </div>
      </template>
    </PageBody>
  </div>
</template>

<style scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--s-4);
}

@media (max-width: 620px) {
  .kpis {
    grid-template-columns: 1fr 1fr;
    gap: var(--s-3);
  }

  .kpis :deep(.card) {
    padding: var(--s-4);
  }

  .kpis :deep(.tile__value) {
    font-size: var(--t-xl);
  }
}

.split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
  gap: var(--s-5);
}

.monitor-card,
.action-card {
  container-type: inline-size;
}

.windows {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--s-5);
}

.windows__head {
  margin-bottom: var(--s-3);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.win {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) 0;
  border-top: 1px solid var(--border);
}

.win__cat {
  min-width: 0;
  font-weight: 550;
  overflow-wrap: anywhere;
}

.win__time {
  font-size: var(--t-sm);
  color: var(--text-muted);
  white-space: nowrap;
}

.win--next {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.win--next .win__cat {
  grid-column: 1;
  grid-row: 1;
}

.win--next .win__time {
  grid-column: 1;
  grid-row: 2;
}

.win--next :deep(.badge) {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: center;
}

.logform {
  display: grid;
  grid-template-columns: 1fr;
  align-items: end;
  gap: var(--s-3);
}

.logform :deep(.btn) {
  grid-column: 1 / -1;
}

.log {
  margin-top: var(--s-5);
  padding-top: var(--s-4);
  border-top: 1px solid var(--border);
}

.log__head {
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.log__empty {
  margin-top: var(--s-3);
  font-size: var(--t-sm);
  color: var(--text-faint);
}

.log__list {
  margin-top: var(--s-2);
  list-style: none;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
}

.log__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-2) 0;
  border-bottom: 1px solid var(--border);
  font-size: var(--t-sm);
}

.log__time {
  color: var(--text-muted);
}

.modes {
  display: flex;
  flex-direction: column;
}

.mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-4) 0;
  border-bottom: 1px solid var(--border);
}

.mode:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.mode__name {
  font-weight: 550;
}

.mode__state {
  font-size: var(--t-sm);
  color: var(--text-muted);
}

@container (min-width: 600px) {
  .windows {
    grid-template-columns: 1fr 1fr;
  }
}

@container (min-width: 420px) {
  .logform {
    grid-template-columns: 1fr 1fr;
  }

  .logform > :nth-child(3),
  .logform :deep(.btn) {
    grid-column: 1 / -1;
  }
}

@container (min-width: 620px) {
  .logform {
    grid-template-columns: minmax(130px, 1fr) minmax(120px, 1fr) minmax(190px, 1.4fr) auto;
  }

  .logform > :nth-child(3),
  .logform :deep(.btn) {
    grid-column: auto;
  }
}
</style>

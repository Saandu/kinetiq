<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import PageBody from '@/components/layout/PageBody.vue'
import KAlertIcon from '@/components/ui/KAlertIcon.vue'
import KBadge from '@/components/ui/KBadge.vue'
import KButton from '@/components/ui/KButton.vue'
import KCard from '@/components/ui/KCard.vue'
import KEmptyState from '@/components/ui/KEmptyState.vue'
import KMeter from '@/components/ui/KMeter.vue'
import KModal from '@/components/ui/KModal.vue'
import KPagination from '@/components/ui/KPagination.vue'
import KStatTile from '@/components/ui/KStatTile.vue'
import { PAGE_SIZE } from '@/config/brand'
import { useFormat } from '@/composables/useFormat'
import { useFleetStore } from '@/stores/fleet'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const router = useRouter()
const fleet = useFleetStore()
const ui = useUiStore()
const { percent } = useFormat()

const page = ref(1)
const pendingRemoval = ref<string | null>(null)

/** Join the static roster to the live status feed. */
const rows = computed(() =>
  fleet.machines.map((machine) => ({
    machine,
    status: fleet.statuses.find((s) => s.id === machine.id) ?? {
      id: machine.id,
      online: false,
      availability: 0,
      alert: 3 as const,
    },
  }))
)

const paginated = computed(() =>
  rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)

// removing the last machine on a page must not strand the user on an empty one
watch(rows, (list) => {
  const maxPage = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  if (page.value > maxPage) page.value = maxPage
})

function openMachine(id: string) {
  fleet.select(id)
  router.push(`/machines/${id}`)
}

function confirmRemoval() {
  const id = pendingRemoval.value
  if (!id) return
  fleet.removeMachine(id)
  pendingRemoval.value = null
  ui.notify(t('dashboard.removed', { id }), 'neutral')
}
</script>

<template>
  <div>
    <AppTopbar :title="t('dashboard.title')" :subtitle="t('dashboard.subtitle')" />

    <PageBody>
      <!-- KPI row: four headline numbers, so stat tiles rather than a chart -->
      <div class="kpis">
        <KCard>
          <KStatTile :label="t('metrics.machines')" :value="String(fleet.summary.total)" />
        </KCard>
        <KCard>
          <KStatTile
            :label="t('metrics.online')"
            :value="`${fleet.summary.online}/${fleet.summary.total}`"
          />
        </KCard>
        <KCard>
          <KStatTile
            :label="t('metrics.avgAvailability')"
            :value="percent(fleet.summary.avgAvailability, 1)"
            :percent="fleet.summary.avgAvailability"
          />
        </KCard>
        <KCard>
          <KStatTile
            :label="t('metrics.alerts')"
            :value="String(fleet.summary.alerts)"
            :hint="fleet.summary.alerts > 0 ? t('alert.2') : t('alert.0')"
          />
        </KCard>
      </div>

      <KCard v-if="!rows.length" :padded="false">
        <KEmptyState :title="t('dashboard.empty.title')" :body="t('dashboard.empty.body')">
          <KButton variant="primary" @click="fleet.restoreMachines()">
            {{ t('dashboard.empty.action') }}
          </KButton>
        </KEmptyState>
      </KCard>

      <template v-else>
        <ul class="fleet">
          <li v-for="row in paginated" :key="row.machine.id">
            <KCard
              class="row"
              interactive
              :accent="row.status.online ? (row.status.alert >= 2 ? 'warn' : 'good') : 'bad'"
            >
              <div class="row__grid">
                <div class="row__id">
                  <p class="row__code">{{ row.machine.id }}</p>
                  <p class="row__name">
                    {{ row.machine.name }} · {{ t(`kind.${row.machine.kind}`) }}
                  </p>
                  <p class="row__loc">{{ row.machine.location }}</p>
                </div>

                <div class="row__status">
                  <KBadge :tone="row.status.online ? 'good' : 'bad'" dot>
                    {{ row.status.online ? t('status.online') : t('status.offline') }}
                  </KBadge>
                </div>

                <div class="row__avail">
                  <div class="row__availhead">
                    <span class="row__label">{{ t('metrics.availability') }}</span>
                    <span class="row__pct tnum">{{ percent(row.status.availability, 1) }}</span>
                  </div>
                  <KMeter :value="row.status.availability" />
                </div>

                <div class="row__alert">
                  <KAlertIcon :level="row.status.alert" />
                  <span class="row__alertlabel">{{ t(`alert.${row.status.alert}`) }}</span>
                </div>

                <div class="row__actions">
                  <KButton size="sm" @click="openMachine(row.machine.id)">
                    {{ t('actions.details') }}
                  </KButton>
                  <button
                    class="row__remove"
                    :aria-label="t('actions.remove')"
                    @click="pendingRemoval = row.machine.id"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path
                        d="M4.5 6h11M8 6V4.6h4V6M6 6l.7 9.2a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L14 6"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </KCard>
          </li>
        </ul>

        <div v-if="rows.length > PAGE_SIZE" class="fleet__pager">
          <KPagination
            :page="page"
            :total="rows.length"
            :per-page="PAGE_SIZE"
            @update:page="page = $event"
          />
        </div>
      </template>
    </PageBody>

    <KModal
      :open="pendingRemoval !== null"
      :title="t('dashboard.remove.title')"
      @close="pendingRemoval = null"
    >
      <p class="dialog__body">
        {{ t('dashboard.remove.body', { id: pendingRemoval ?? '' }) }}
      </p>
      <p class="dialog__note">{{ t('dashboard.remove.note') }}</p>

      <template #footer>
        <KButton @click="pendingRemoval = null">{{ t('actions.cancel') }}</KButton>
        <KButton variant="danger" data-autofocus @click="confirmRemoval">
          {{ t('actions.confirm') }}
        </KButton>
      </template>
    </KModal>
  </div>
</template>

<style scoped>
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--s-4);
}

/*
 * auto-fit collapses these four tiles into a single 500px-tall column on a
 * phone, pushing the actual machine list below the fold. A fixed 2x2 keeps the
 * summary to a glance and gets the fleet on screen.
 */
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

.fleet {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  list-style: none;
  padding: 0;
}

.fleet__pager {
  display: flex;
  justify-content: center;
}

.row__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) auto minmax(180px, 1.2fr) auto auto;
  align-items: center;
  gap: var(--s-5);
}

.row__code {
  font-family: var(--font-mono);
  font-size: var(--t-md);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.row__name {
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.row__loc {
  font-size: var(--t-xs);
  color: var(--text-faint);
}

.row__availhead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  margin-bottom: var(--s-2);
}

.row__label {
  font-size: var(--t-xs);
  color: var(--text-muted);
}

.row__pct {
  font-size: var(--t-md);
  font-weight: 600;
}

.row__alert {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 88px;
}

.row__alertlabel {
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.row__actions {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.row__remove {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--r-xs);
  color: var(--text-faint);
  transition:
    background-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}

.row__remove svg {
  width: 17px;
  height: 17px;
}

.row__remove:hover {
  background: var(--c-red-soft);
  color: var(--c-red);
}

.dialog__body {
  font-size: var(--t-md);
}

.dialog__note {
  margin-top: var(--s-3);
  font-size: var(--t-base);
  color: var(--text-muted);
}

@media (pointer: coarse) {
  .row__remove {
    width: 44px;
    height: 44px;
  }

  .row__remove svg {
    width: 19px;
    height: 19px;
  }
}

@media (max-width: 1100px) {
  .row__grid {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'id actions'
      'avail avail'
      'status alert';
    gap: var(--s-4);
  }

  .row__id {
    grid-area: id;
  }

  .row__status {
    grid-area: status;
  }

  .row__avail {
    grid-area: avail;
  }

  .row__alert {
    grid-area: alert;
    justify-self: end;
  }

  .row__actions {
    grid-area: actions;
  }
}
</style>

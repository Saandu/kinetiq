<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import PageBody from '@/components/layout/PageBody.vue'
import KStateBar from '@/components/charts/KStateBar.vue'
import KAlertIcon from '@/components/ui/KAlertIcon.vue'
import KButton from '@/components/ui/KButton.vue'
import KCard from '@/components/ui/KCard.vue'
import KEmptyState from '@/components/ui/KEmptyState.vue'
import KModal from '@/components/ui/KModal.vue'
import KStatTile from '@/components/ui/KStatTile.vue'
import { useFormat } from '@/composables/useFormat'
import { useStateLabels } from '@/composables/useStateLabels'
import { useFleetStore } from '@/stores/fleet'
import { useUiStore } from '@/stores/ui'
import type { MachineNotification } from '@/types/telemetry'

const { t } = useI18n()
const fleet = useFleetStore()
const ui = useUiStore()
const { formatDateTime, formatRelative, percent } = useFormat()

const stateLabels = useStateLabels(toRef(fleet, 'selectedId'))

const detail = ref<MachineNotification | null>(null)
const pendingDismiss = ref<string | null>(null)

const items = computed(() => fleet.selectedNotifications)

function confirmDismiss() {
  if (!pendingDismiss.value) return
  fleet.dismissNotification(pendingDismiss.value)
  pendingDismiss.value = null
  ui.notify(t('notifications.dismissed'), 'neutral')
}
</script>

<template>
  <div>
    <AppTopbar
      :title="t('notifications.title')"
      :subtitle="t('notifications.subtitle', { machine: fleet.selectedId })"
    />

    <PageBody>
      <KCard v-if="!items.length" :padded="false">
        <KEmptyState
          :title="t('notifications.empty.title')"
          :body="t('notifications.empty.body')"
        />
      </KCard>

      <ul v-else class="feed">
        <li v-for="item in items" :key="item.id">
          <KCard class="note">
            <div class="note__grid">
              <KAlertIcon :level="item.level" :size="20" />

              <div class="note__main">
                <p class="note__msg">
                  <!-- the value is the part the reader scans for, so it carries
                       the tone colour while the sentence stays in body ink -->
                  <i18n-t :keypath="item.messageKey" tag="span" scope="global">
                    <template #value>
                      <strong :class="['note__value', `note__value--${item.tone}`]">
                        {{ item.value }}
                      </strong>
                    </template>
                  </i18n-t>
                </p>
                <p class="note__meta tnum">
                  {{ formatDateTime(item.at) }} · {{ formatRelative(item.at, fleet.now) }}
                </p>
              </div>

              <div class="note__actions">
                <KButton size="sm" @click="detail = item">{{ t('actions.details') }}</KButton>
                <button
                  class="note__x"
                  :aria-label="t('actions.dismiss')"
                  @click="pendingDismiss = item.id"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </KCard>
        </li>
      </ul>
    </PageBody>

    <!-- detail -->
    <KModal
      :open="detail !== null"
      :title="t('notifications.details.title')"
      size="md"
      @close="detail = null"
    >
      <template v-if="detail">
        <dl class="meta">
          <div class="meta__row">
            <dt>{{ t('notifications.details.machine') }}</dt>
            <dd class="meta__mono">{{ detail.machineId }}</dd>
          </div>
          <div class="meta__row">
            <dt>{{ t('notifications.details.date') }}</dt>
            <dd class="tnum">{{ formatDateTime(detail.at) }}</dd>
          </div>
          <div class="meta__row">
            <dt>{{ t('notifications.details.interval') }}</dt>
            <dd>{{ detail.snapshot.interval }}</dd>
          </div>
        </dl>

        <p class="detail__label">{{ t('notifications.details.message') }}</p>
        <p class="detail__msg">
          <i18n-t :keypath="detail.messageKey" tag="span" scope="global">
            <template #value>
              <strong :class="['note__value', `note__value--${detail.tone}`]">
                {{ detail.value }}
              </strong>
            </template>
          </i18n-t>
        </p>

        <p class="detail__label">{{ t('notifications.details.snapshot') }}</p>
        <div class="detail__tiles">
          <KStatTile
            :label="t('metrics.availability')"
            :value="percent(detail.snapshot.availability)"
            :percent="detail.snapshot.availability"
          />
          <KStatTile
            :label="t('metrics.anomalyScore')"
            :value="percent(detail.snapshot.anomalyScore, 1)"
            :percent="detail.snapshot.anomalyScore"
            tone="info"
          />
          <KStatTile
            :label="t('metrics.confidence')"
            :value="percent(detail.snapshot.confidence * 100, 1)"
            :percent="detail.snapshot.confidence * 100"
            tone="good"
          />
        </div>

        <div class="detail__chart">
          <KStateBar
            :slices="detail.snapshot.states"
            :labels="stateLabels"
            :current-state="-1"
          />
        </div>
      </template>

      <template #footer>
        <KButton data-autofocus @click="detail = null">{{ t('actions.close') }}</KButton>
      </template>
    </KModal>

    <!-- dismiss confirmation -->
    <KModal
      :open="pendingDismiss !== null"
      :title="t('notifications.dismiss.title')"
      @close="pendingDismiss = null"
    >
      <p>{{ t('notifications.dismiss.body') }}</p>
      <template #footer>
        <KButton @click="pendingDismiss = null">{{ t('actions.cancel') }}</KButton>
        <KButton variant="danger" data-autofocus @click="confirmDismiss">
          {{ t('actions.confirm') }}
        </KButton>
      </template>
    </KModal>
  </div>
</template>

<style scoped>
.feed {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  list-style: none;
  padding: 0;
}

.note__grid {
  display: flex;
  align-items: center;
  gap: var(--s-4);
}

.note__main {
  flex: 1;
  min-width: 0;
}

.note__msg {
  font-size: var(--t-md);
}

.note__value {
  font-weight: 650;
}

.note__value--good {
  color: var(--c-green-ink);
}

.note__value--bad {
  color: var(--c-red-ink);
}

.note__meta {
  margin-top: 2px;
  font-size: var(--t-sm);
  color: var(--text-faint);
}

.note__actions {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.note__x {
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

.note__x svg {
  width: 15px;
  height: 15px;
}

.note__x:hover {
  background: var(--surface-inset);
  color: var(--text);
}

@media (pointer: coarse) {
  .note__x {
    width: 44px;
    height: 44px;
  }

  .note__x svg {
    width: 18px;
    height: 18px;
  }
}

/*
 * The message is the point of the row, so on a narrow screen the actions drop
 * beneath it rather than squeezing it into a two-word column.
 */
@media (max-width: 520px) {
  .note__grid {
    flex-wrap: wrap;
    row-gap: var(--s-3);
  }

  .note__main {
    flex: 1 1 calc(100% - 36px);
  }

  .note__actions {
    flex: 1 1 100%;
    justify-content: space-between;
  }
}

.meta {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--s-5);
}

.meta__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-2) 0;
  border-bottom: 1px solid var(--border);
  font-size: var(--t-base);
}

.meta__row dt {
  color: var(--text-muted);
}

.meta__mono {
  font-family: var(--font-mono);
}

.detail__label {
  margin-bottom: var(--s-2);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.detail__msg {
  margin-bottom: var(--s-5);
  font-size: var(--t-md);
}

.detail__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--s-4);
  margin-bottom: var(--s-5);
}

.detail__chart {
  padding-top: var(--s-4);
  border-top: 1px solid var(--border);
}
</style>

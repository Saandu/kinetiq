<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import KToaster from '@/components/ui/KToaster.vue'
import KButton from '@/components/ui/KButton.vue'
import { useFleetStore } from '@/stores/fleet'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const fleet = useFleetStore()
const { t } = useI18n()

ui.hydrate()

/**
 * One subscription for the whole app. Individual pages never own a timer, so
 * navigating between them cannot leak one.
 */
let release: (() => void) | null = null

onMounted(() => {
  release = fleet.subscribe()
})

onUnmounted(() => {
  release?.()
})
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#main-content" :inert="ui.sidebarOpen ? true : undefined">{{ t('a11y.skipContent') }}</a>
    <AppSidebar />
    <main id="main-content" class="shell__main" tabindex="-1" :inert="ui.sidebarOpen ? true : undefined">
      <div v-if="fleet.error" class="data-status" role="alert">
        <p>{{ t(fleet.writeError ? 'data.writeFailed' : 'data.loadFailed') }}</p>
        <KButton v-if="!fleet.writeError" size="sm" :disabled="fleet.loading" @click="fleet.refresh()">{{ t('actions.retry') }}</KButton>
      </div>
      <p v-if="fleet.loading && !fleet.loaded" class="data-status" role="status">{{ t('data.loading') }}</p>
      <RouterView v-else-if="fleet.loaded" v-slot="{ Component }">
        <Transition name="route-fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <KToaster />
  </div>
</template>

<style scoped>
.data-status {
  margin: var(--s-5);
  padding: var(--s-4);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}

.shell {
  min-height: 100vh;
}

.shell__main {
  margin-left: var(--sidebar-w);
  min-height: 100vh;
}

@media (max-width: 900px) {
  .shell__main {
    margin-left: 0;
  }
}
</style>

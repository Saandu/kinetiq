<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import KToaster from '@/components/ui/KToaster.vue'
import { useFleetStore } from '@/stores/fleet'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const fleet = useFleetStore()

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
    <AppSidebar />
    <div class="shell__main">
      <RouterView v-slot="{ Component }">
        <Transition name="route-fade" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </div>
    <KToaster />
  </div>
</template>

<style scoped>
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

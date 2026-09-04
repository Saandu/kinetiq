<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <Teleport to="body">
    <div class="toaster" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="toast in ui.toasts"
          :key="toast.id"
          :class="['toast', `toast--${toast.tone}`]"
          @click="ui.dismissToast(toast.id)"
        >
          <span class="toast__rail" />
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toaster {
  position: fixed;
  top: var(--s-4);
  right: var(--s-4);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  pointer-events: none;
}

.toast {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 240px;
  max-width: 360px;
  padding: var(--s-3) var(--s-4) var(--s-3) var(--s-4);
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-lg);
  font-size: var(--t-base);
  cursor: pointer;
  pointer-events: auto;
}

.toast__rail {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
}

.toast--good .toast__rail {
  background: var(--c-green);
}

.toast--bad .toast__rail {
  background: var(--c-red);
}

.toast--neutral .toast__rail {
  background: var(--text-faint);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--dur) var(--ease),
    transform var(--dur) var(--ease-out);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(12px);
}

.toast-leave-active {
  position: absolute;
  right: 0;
}
</style>

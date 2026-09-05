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
  z-index: var(--z-toast);
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
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  font-size: var(--t-base);
  cursor: pointer;
  pointer-events: auto;
}

.toast--good {
  background: color-mix(in srgb, var(--c-green) 7%, var(--surface));
  border-color: color-mix(in srgb, var(--c-green) 50%, var(--border));
}

.toast--bad {
  background: color-mix(in srgb, var(--c-red) 7%, var(--surface));
  border-color: color-mix(in srgb, var(--c-red) 50%, var(--border));
}

.toast--neutral {
  background: var(--surface);
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

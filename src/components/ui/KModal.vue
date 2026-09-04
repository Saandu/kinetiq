<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { lockScroll, unlockScroll } from '@/composables/useScrollLock'

const props = defineProps<{ open: boolean; title?: string; size?: 'sm' | 'md' }>()
const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)

/**
 * Escape-to-close and initial focus. Deliberately not a full focus trap: the
 * dialogs here are two buttons deep, and a half-correct trap is worse than
 * none. If these ever grow, swap the root for <dialog>.
 */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown)
      lockScroll()
      await nextTick()
      panel.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else {
      document.removeEventListener('keydown', onKeydown)
      unlockScroll()
    }
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (props.open) unlockScroll()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal" @click.self="emit('close')">
        <div
          ref="panel"
          class="modal__panel"
          :class="`modal__panel--${size ?? 'sm'}`"
          role="dialog"
          aria-modal="true"
        >
          <header class="modal__head">
            <h2 class="modal__title">{{ title }}</h2>
            <button class="modal__x" :aria-label="'close'" @click="emit('close')">
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
          </header>

          <div class="modal__body"><slot /></div>

          <footer v-if="$slots.footer" class="modal__foot"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s-4);
  background: rgba(12, 13, 16, 0.55);
  backdrop-filter: blur(3px);
}

.modal__panel {
  width: 100%;
  max-height: calc(100vh - var(--s-8));
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
}

.modal__panel--sm {
  max-width: 440px;
}

.modal__panel--md {
  max-width: 720px;
}

.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  border-bottom: 1px solid var(--border);
}

.modal__title {
  font-size: var(--t-md);
  font-weight: 600;
}

.modal__x {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-xs);
  color: var(--text-muted);
  transition: background-color var(--dur-fast) var(--ease);
}

.modal__x:hover {
  background: var(--surface-inset);
  color: var(--text);
}

.modal__x svg {
  width: 16px;
  height: 16px;
}

.modal__body {
  padding: var(--s-5);
  overflow-y: auto;
}

.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
  padding: var(--s-4) var(--s-5);
  border-top: 1px solid var(--border);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--dur) var(--ease);
}

.modal-enter-active .modal__panel {
  transition: transform var(--dur) var(--ease-out);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal__panel {
  transform: translateY(8px) scale(0.985);
}

/*
 * On a phone the dialog becomes a bottom sheet: anchored to the thumb, full
 * width, and rounded only on the leading edge. It also rises from below rather
 * than fading in place, which matches how the platform's own sheets behave.
 */
@media (max-width: 600px) {
  .modal {
    align-items: flex-end;
    padding: 0;
  }

  .modal__panel,
  .modal__panel--sm,
  .modal__panel--md {
    max-width: none;
    max-height: 92dvh;
    border-radius: var(--r-xl) var(--r-xl) 0 0;
    border-bottom: none;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .modal__head {
    padding: var(--s-4);
  }

  .modal__body {
    padding: var(--s-4);
    /* momentum scrolling inside the sheet rather than dragging the page */
    overscroll-behavior: contain;
  }

  .modal__foot {
    padding: var(--s-4);
    padding-bottom: calc(var(--s-4) + env(safe-area-inset-bottom));
  }

  /* stacked, full-width actions are far easier to hit than a right-aligned pair */
  .modal__foot :deep(.btn) {
    flex: 1;
  }

  .modal-enter-from .modal__panel {
    transform: translateY(100%);
  }

  .modal-leave-to .modal__panel {
    transform: translateY(100%);
  }

  .modal-leave-active .modal__panel {
    transition: transform var(--dur) var(--ease);
  }
}

@media (pointer: coarse) {
  .modal__x {
    width: 44px;
    height: 44px;
    margin-right: calc(var(--s-2) * -1);
  }

  .modal__x svg {
    width: 20px;
    height: 20px;
  }
}
</style>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
    size?: 'sm' | 'md'
    type?: 'button' | 'submit'
    disabled?: boolean
    block?: boolean
  }>(),
  {
    variant: 'secondary',
    size: 'md',
    type: 'button',
    disabled: false,
    block: false,
  }
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    :class="['btn', `btn--${variant}`, `btn--${size}`, { 'btn--block': block }]"
  >
    <slot name="icon" />
    <span v-if="$slots.default" class="btn__label"><slot /></span>
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  font-weight: 550;
  white-space: nowrap;
  transition:
    background-color var(--dur-fast) var(--ease),
    border-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease),
    transform var(--dur-fast) var(--ease);
}

.btn:active:not(:disabled) {
  transform: translateY(0.5px);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--sm {
  height: 30px;
  padding: 0 var(--s-3);
  font-size: var(--t-sm);
}

.btn--md {
  height: 36px;
  padding: 0 var(--s-4);
  font-size: var(--t-base);
}

.btn--block {
  width: 100%;
}

/* primary — the one green button per view */
.btn--primary {
  background: var(--accent);
  color: var(--text-on-accent);
}

.btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

/* secondary — bordered, the workhorse */
.btn--secondary {
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--text);
}

.btn--secondary:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--text-faint);
}

/* subtle — filled, no border, for in-card actions */
.btn--subtle {
  background: var(--surface-inset);
  color: var(--text);
}

.btn--subtle:hover:not(:disabled) {
  background: var(--surface-hover);
}

.btn--ghost {
  background: transparent;
  color: var(--text-muted);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--surface-inset);
  color: var(--text);
}

.btn--danger {
  background: transparent;
  border-color: var(--border-strong);
  color: var(--c-red-ink);
}

.btn--danger:hover:not(:disabled) {
  background: var(--c-red-soft);
  border-color: var(--c-red-ink);
}

.btn__label {
  line-height: 1;
}

/*
 * Thumbs need ~44px. Rather than making every desktop button chunky, the sizes
 * grow only where the pointer is actually coarse.
 */
@media (pointer: coarse) {
  .btn--sm {
    height: 44px;
    padding: 0 var(--s-4);
    font-size: var(--t-base);
  }

  .btn--md {
    height: 46px;
    padding: 0 var(--s-5);
    font-size: var(--t-md);
  }
}
</style>

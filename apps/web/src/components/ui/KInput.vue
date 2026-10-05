<script setup lang="ts">
withDefaults(
  defineProps<{
    id?: string
    type?: 'text' | 'number' | 'date' | 'time'
    placeholder?: string
    step?: string | number
    min?: string | number
    max?: string | number
    disabled?: boolean
  }>(),
  { type: 'text', disabled: false }
)

const model = defineModel<string | number>()
</script>

<template>
  <input
    :id="id"
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    :step="step"
    :min="min"
    :max="max"
    :disabled="disabled"
    class="input"
    :class="{ 'input--num': type === 'number' }"
  />
</template>

<style scoped>
.input {
  width: 100%;
  height: 36px;
  padding: 0 var(--s-3);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  color: var(--text);
  font-size: var(--t-base);
  transition:
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease),
    background-color var(--dur-fast) var(--ease);
}

.input--num {
  font-variant-numeric: tabular-nums;
}

.input::placeholder {
  color: var(--text-faint);
}

.input:hover:not(:disabled) {
  border-color: var(--text-faint);
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.input:disabled {
  background: var(--surface-inset);
  opacity: 0.6;
  cursor: not-allowed;
}

/* the native pickers' indicator is near-invisible on dark surfaces */
:root[data-theme='dark'] .input::-webkit-calendar-picker-indicator {
  filter: invert(0.7);
}

/*
 * 16px is not a style choice: iOS Safari zooms the whole page when a focused
 * input's text is smaller than that, and the user is then stranded at 1.5x with
 * the layout scrolled sideways. Everything below 16px has to grow on touch.
 */
@media (pointer: coarse) {
  .input {
    height: 46px;
    padding: 0 var(--s-4);
    font-size: 16px;
  }
}
</style>

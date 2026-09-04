<script setup lang="ts">
/**
 * Native <select> under a custom skin.
 *
 * A hand-rolled listbox would need focus management, typeahead and mobile
 * handling to match what the platform already ships. The chrome is ours, the
 * behaviour is the browser's.
 */
defineProps<{
  id?: string
  options: { value: string; label: string }[]
  placeholder?: string
  disabled?: boolean
}>()

const model = defineModel<string>()
</script>

<template>
  <div class="select">
    <select :id="id" v-model="model" :disabled="disabled" class="select__el">
      <option v-if="placeholder" value="" disabled>{{ placeholder }}</option>
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <svg class="select__chevron" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 6.5 8 10.5 12 6.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </div>
</template>

<style scoped>
.select {
  position: relative;
  width: 100%;
}

.select__el {
  width: 100%;
  height: 36px;
  padding: 0 var(--s-8) 0 var(--s-3);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  color: var(--text);
  font-size: var(--t-base);
  appearance: none;
  cursor: pointer;
  transition:
    border-color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease);
}

.select__el:hover:not(:disabled) {
  border-color: var(--text-faint);
}

.select__el:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.select__el:disabled {
  background: var(--surface-inset);
  opacity: 0.6;
  cursor: not-allowed;
}

/* the popup list is OS-drawn; force readable colours in dark mode */
.select__el option {
  background: var(--surface);
  color: var(--text);
}

.select__chevron {
  position: absolute;
  top: 50%;
  right: var(--s-3);
  width: 16px;
  height: 16px;
  transform: translateY(-50%);
  color: var(--text-faint);
  pointer-events: none;
}

/* same 16px rule as KInput -- a sub-16px select zooms iOS on focus too */
@media (pointer: coarse) {
  .select__el {
    height: 46px;
    padding: 0 var(--s-10) 0 var(--s-4);
    font-size: 16px;
  }
}
</style>

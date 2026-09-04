<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ label?: string; hint?: string }>()

/** Vue 3.5's useId keeps label/control wiring correct without a global counter. */
const id = useId()
</script>

<template>
  <div class="field">
    <label v-if="label" :for="id" class="field__label">{{ label }}</label>
    <slot :id="id" />
    <p v-if="hint" class="field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}

.field__label {
  font-size: var(--t-sm);
  font-weight: 550;
  color: var(--text-muted);
}

.field__hint {
  font-size: var(--t-xs);
  color: var(--text-faint);
}
</style>

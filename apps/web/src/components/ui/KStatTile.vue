<script setup lang="ts">
import KMeter from './KMeter.vue'

/**
 * A single current value. Per the form heuristic this is a stat tile with a
 * meter track, not a radial gauge -- a ratio against a limit is read faster
 * off a straight track, and the number is the thing that matters.
 */
withDefaults(
  defineProps<{
    label: string
    value: string
    /** 0..100, drives the meter; omit to hide the track */
    percent?: number
    tone?: 'auto' | 'good' | 'bad' | 'warn' | 'info'
    hint?: string
    size?: 'md' | 'lg'
  }>(),
  { tone: 'auto', size: 'md' }
)
</script>

<template>
  <div class="tile" :class="`tile--${size}`">
    <p class="tile__label">{{ label }}</p>
    <p class="tile__value tnum">{{ value }}</p>
    <KMeter v-if="percent !== undefined" :value="percent" :tone="tone" class="tile__meter" />
    <p v-if="hint" class="tile__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tile__label {
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.tile__value {
  margin-top: 2px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.tile--md .tile__value {
  font-size: var(--t-2xl);
}

.tile--lg .tile__value {
  font-size: var(--t-3xl);
}

.tile__meter {
  margin-top: var(--s-3);
}

.tile__hint {
  margin-top: var(--s-2);
  font-size: var(--t-xs);
  color: var(--text-faint);
}
</style>

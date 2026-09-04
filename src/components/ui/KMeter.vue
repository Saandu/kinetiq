<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ value: number; max?: number; tone?: 'auto' | 'good' | 'bad' | 'warn' | 'info' }>(),
  { max: 100, tone: 'auto' }
)

const pct = computed(() => Math.min(100, Math.max(0, (props.value / props.max) * 100)))

/** In 'auto' the bar colours itself from the value, matching the alert ladder. */
const resolvedTone = computed(() => {
  if (props.tone !== 'auto') return props.tone
  if (pct.value < 62) return 'bad'
  if (pct.value < 86) return 'warn'
  return 'good'
})
</script>

<template>
  <div class="meter" :class="`meter--${resolvedTone}`">
    <div class="meter__fill" :style="{ width: `${pct}%` }" />
  </div>
</template>

<style scoped>
.meter {
  width: 100%;
  height: 6px;
  background: var(--surface-inset);
  border-radius: var(--r-full);
  overflow: hidden;
}

.meter__fill {
  height: 100%;
  border-radius: var(--r-full);
  /* the value updates on every tick — animate so it reads as motion, not a jump */
  transition:
    width var(--dur-slow) var(--ease-out),
    background-color var(--dur) var(--ease);
}

.meter--good .meter__fill {
  background: var(--c-green);
}

.meter--warn .meter__fill {
  background: var(--c-amber);
}

.meter--bad .meter__fill {
  background: var(--c-red);
}

.meter--info .meter__fill {
  background: var(--c-blue);
}
</style>

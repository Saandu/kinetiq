<script setup lang="ts">
import { computed } from 'vue'
import type { AlertLevel } from '@/types/telemetry'

/**
 * Severity icon. The shape changes with the level, not just the colour -- a
 * status cue must never rely on hue alone, and these sit next to a text label
 * everywhere they appear.
 */
const props = defineProps<{ level: AlertLevel; size?: number }>()

const tone = computed(() => {
  switch (props.level) {
    case 3:
      return 'bad'
    case 2:
      return 'warn'
    case 1:
      return 'info'
    default:
      return 'good'
  }
})
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    :class="['alert', `alert--${tone}`]"
  >
    <!-- critical: filled triangle -->
    <template v-if="level === 3">
      <path
        d="M10 2.6 18.2 16.8H1.8Z"
        fill="currentColor"
        opacity="0.16"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
      <path d="M10 7.6v4.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="10" cy="14.4" r="1" fill="currentColor" />
    </template>

    <!-- warning: rounded square -->
    <template v-else-if="level === 2">
      <rect
        x="2.6"
        y="2.6"
        width="14.8"
        height="14.8"
        rx="4"
        fill="currentColor"
        opacity="0.16"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path d="M10 6.4v4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="10" cy="13.6" r="1" fill="currentColor" />
    </template>

    <!-- watch: hollow circle -->
    <template v-else-if="level === 1">
      <circle
        cx="10"
        cy="10"
        r="7.4"
        fill="currentColor"
        opacity="0.14"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path d="M10 6.3v4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="10" cy="13.4" r="0.95" fill="currentColor" />
    </template>

    <!-- normal: check -->
    <template v-else>
      <circle
        cx="10"
        cy="10"
        r="7.4"
        fill="currentColor"
        opacity="0.14"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <path
        d="m6.7 10.2 2.2 2.2 4.4-4.6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </template>
  </svg>
</template>

<style scoped>
.alert {
  flex: none;
}

.alert--good {
  color: var(--c-green-ink);
}

.alert--info {
  color: var(--c-blue-ink);
}

.alert--warn {
  color: var(--c-amber-ink);
}

.alert--bad {
  color: var(--c-red-ink);
}
</style>

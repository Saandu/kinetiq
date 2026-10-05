<script setup lang="ts">
withDefaults(
  defineProps<{ tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'info'; dot?: boolean }>(),
  { tone: 'neutral', dot: false }
)
</script>

<template>
  <span :class="['badge', `badge--${tone}`]">
    <span v-if="dot" class="badge__dot" />
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  height: 22px;
  padding: 0 var(--s-2);
  border-radius: var(--r-xs);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.badge__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--r-full);
  background: currentColor;
}

.badge--neutral {
  background: var(--surface-inset);
  color: var(--text-muted);
}

.badge--good {
  background: var(--c-green-soft);
  color: var(--c-green-ink);
}

.badge--bad {
  background: var(--c-red-soft);
  color: var(--c-red-ink);
}

.badge--warn {
  background: var(--c-amber-soft);
  color: var(--c-amber-ink);
}

.badge--info {
  background: var(--c-blue-soft);
  color: var(--c-blue-ink);
}
</style>

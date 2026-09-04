<script setup lang="ts">
/**
 * The Kinetiq mark: an open rotor arc with an offset mass.
 *
 * The offset dot is the idea of the product in one shape -- an imbalance
 * detected on a rotating part. It survives being scaled to 16px because it is
 * only two elements, and it works in mono (the arc inherits currentColor).
 */
withDefaults(defineProps<{ size?: number; mono?: boolean }>(), {
  size: 28,
  mono: false,
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    class="mark"
  >
    <path
      d="M12.24 5.66 A 11 11 0 1 1 6.47 21.5"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    />
    <circle cx="12.24" cy="5.66" r="3.4" :fill="mono ? 'currentColor' : 'var(--accent)'" />
  </svg>
</template>

<style scoped>
.mark {
  flex: none;
  display: block;
}
</style>

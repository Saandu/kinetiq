<script setup lang="ts">
import { computed } from 'vue'
import type { StateSlice } from '@/types/telemetry'

/**
 * Operating-state distribution as a horizontal stacked bar.
 *
 * Part-to-whole with up-to-six named categories: a stacked bar supports direct
 * comparison on a shared baseline and leaves room for readable labels.
 *
 * Segments are separated by a surface-coloured gap rather than a stroke, so the
 * boundary reads at any size and stays correct in both themes.
 */
const props = defineProps<{
  slices: StateSlice[]
  labels: string[]
  currentState: number
}>()

const GAP = 2

const segments = computed(() =>
  props.slices.map((slice) => ({
    index: slice.index,
    share: slice.share,
    pct: slice.share * 100,
    label: props.labels[slice.index] ?? `#${slice.index + 1}`,
    color: `var(--series-${(slice.index % 8) + 1})`,
  }))
)
</script>

<template>
  <div class="statebar">
    <div class="statebar__track" :style="{ gap: `${GAP}px` }">
      <div
        v-for="seg in segments"
        :key="seg.index"
        class="statebar__seg"
        :style="{ flexGrow: seg.share, background: seg.color }"
        :title="`${seg.label} — ${seg.pct.toFixed(1)}%`"
      />
    </div>

    <!--
      The legend is mandatory, not optional chrome: three of the light-mode
      series colours sit under 3:1 on white, so the label is what actually
      carries identity.
    -->
    <ul class="statebar__legend">
      <li
        v-for="seg in segments"
        :key="seg.index"
        class="statebar__item"
        :class="{ 'statebar__item--current': seg.index === currentState }"
      >
        <span class="statebar__swatch" :style="{ background: seg.color }" />
        <span class="statebar__label">{{ seg.label }}</span>
        <span class="statebar__value tnum">{{ seg.pct.toFixed(1) }}%</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.statebar {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.statebar__track {
  display: flex;
  width: 100%;
  height: 14px;
  border-radius: var(--r-xs);
  overflow: hidden;
}

.statebar__seg {
  min-width: 3px;
  border-radius: 3px;
  /* shares drift every tick — animate the reflow rather than snapping */
  transition:
    flex-grow var(--dur-slow) var(--ease-out),
    background-color var(--dur) var(--ease);
}

.statebar__legend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--s-2) var(--s-4);
  list-style: none;
  padding: 0;
}

.statebar__item {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 3px var(--s-2);
  border-radius: var(--r-xs);
  font-size: var(--t-sm);
  border: 1px solid transparent;
}

/* the state the machine is in right now gets the emphasis */
.statebar__item--current {
  background: var(--surface-inset);
  border-color: var(--border);
}

.statebar__swatch {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 2px;
}

.statebar__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
}

.statebar__item--current .statebar__label {
  color: var(--text);
  font-weight: 550;
}

.statebar__value {
  flex: none;
  color: var(--text);
  font-weight: 550;
}
</style>

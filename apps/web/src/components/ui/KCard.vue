<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    hint?: string
    padded?: boolean
    accent?: 'none' | 'good' | 'bad' | 'warn'
  }>(),
  { padded: true, accent: 'none' }
)
</script>

<template>
  <section
    :class="[
      'card',
      { 'card--padded': padded },
      accent !== 'none' && `card--${accent}`,
    ]"
  >
    <header v-if="title || $slots.header" class="card__head">
      <div class="card__heading">
        <h2 v-if="title" class="card__title">{{ title }}</h2>
        <p v-if="hint" class="card__hint">{{ hint }}</p>
      </div>
      <div v-if="$slots.actions" class="card__actions"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  transition:
    border-color var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}

.card--padded {
  padding: var(--s-5);
}

.card--good {
  border-color: color-mix(in srgb, var(--c-green) 45%, var(--border));
}

.card--bad {
  border-color: color-mix(in srgb, var(--c-red) 45%, var(--border));
}

.card--warn {
  border-color: color-mix(in srgb, var(--c-amber) 45%, var(--border));
}

.card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-4);
  margin-bottom: var(--s-4);
}

.card__title {
  font-size: var(--t-md);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.card__hint {
  margin-top: 2px;
  font-size: var(--t-sm);
  color: var(--text-muted);
}

.card__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

@media (max-width: 620px) {
  .card--padded {
    padding: var(--s-4);
  }

  .card__head {
    margin-bottom: var(--s-3);
  }
}
</style>

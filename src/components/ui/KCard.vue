<script setup lang="ts">
/**
 * Flat by default: a hairline border provides separation and interactive cards
 * gain a small amount of elevation on hover.
 */
withDefaults(
  defineProps<{
    title?: string
    hint?: string
    padded?: boolean
    interactive?: boolean
    accent?: 'none' | 'good' | 'bad' | 'warn'
  }>(),
  { padded: true, interactive: false, accent: 'none' }
)
</script>

<template>
  <section
    :class="[
      'card',
      { 'card--interactive': interactive, 'card--padded': padded },
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
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--dur) var(--ease),
    box-shadow var(--dur) var(--ease),
    background-color var(--dur) var(--ease);
}

.card--padded {
  padding: var(--s-5);
}

.card--interactive:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
}

/* A narrow status rail adds emphasis without tinting the whole surface. */
.card--good::before,
.card--bad::before,
.card--warn::before {
  content: '';
  position: absolute;
  inset: auto auto 0 0;
  top: 0;
  width: 3px;
  border-radius: var(--r-lg) 0 0 var(--r-lg);
}

.card--good::before {
  background: var(--c-green);
}

.card--bad::before {
  background: var(--c-red);
}

.card--warn::before {
  background: var(--c-amber);
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

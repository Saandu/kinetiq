<script setup lang="ts">
defineProps<{ title: string; body?: string }>()
</script>

<template>
  <div class="empty">
    <div class="empty__icon">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle
          cx="16"
          cy="16"
          r="11"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-dasharray="3 4"
          stroke-linecap="round"
        />
        <path
          d="M16 11v6"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <circle cx="16" cy="20.5" r="1.1" fill="currentColor" />
      </svg>
    </div>
    <h3 class="empty__title">{{ title }}</h3>
    <p v-if="body" class="empty__body">{{ body }}</p>
    <div v-if="$slots.default" class="empty__action"><slot /></div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--s-12) var(--s-5);
}

.empty__icon {
  color: var(--text-faint);
  margin-bottom: var(--s-4);
}

.empty__icon svg {
  width: 40px;
  height: 40px;
}

.empty__title {
  font-size: var(--t-md);
  font-weight: 600;
}

.empty__body {
  max-width: 42ch;
  margin-top: var(--s-2);
  font-size: var(--t-base);
  color: var(--text-muted);
}

.empty__action {
  margin-top: var(--s-5);
}
</style>

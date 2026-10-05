<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ page: number; total: number; perPage: number }>()
const emit = defineEmits<{ 'update:page': [number] }>()

const { t } = useI18n()

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.perPage)))
const pages = computed(() => Array.from({ length: pageCount.value }, (_, i) => i + 1))

function go(page: number) {
  if (page < 1 || page > pageCount.value || page === props.page) return
  emit('update:page', page)
}
</script>

<template>
  <nav v-if="pageCount > 1" class="pager" :aria-label="t('a11y.pagination')">
    <button
      class="pager__btn"
      :disabled="page === 1"
      :aria-label="t('a11y.previousPage')"
      @click="go(page - 1)"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M10 3.5 5.5 8l4.5 4.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <button
      v-for="n in pages"
      :key="n"
      class="pager__btn pager__btn--num"
      :class="{ 'pager__btn--active': n === page }"
      :aria-current="n === page ? 'page' : undefined"
      :aria-label="t('a11y.page', { n })"
      @click="go(n)"
    >
      {{ n }}
    </button>

    <button
      class="pager__btn"
      :disabled="page === pageCount"
      :aria-label="t('a11y.nextPage')"
      @click="go(page + 1)"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M6 3.5 10.5 8 6 12.5"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  align-items: center;
  gap: var(--s-1);
}

.pager__btn {
  display: grid;
  place-items: center;
  min-width: 30px;
  height: 30px;
  padding: 0 var(--s-2);
  border-radius: var(--r-xs);
  color: var(--text-muted);
  font-size: var(--t-sm);
  font-weight: 550;
  font-variant-numeric: tabular-nums;
  transition:
    background-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}

.pager__btn svg {
  width: 15px;
  height: 15px;
}

.pager__btn:hover:not(:disabled) {
  background: var(--surface-inset);
  color: var(--text);
}

.pager__btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pager__btn--active {
  background: var(--text);
  color: var(--surface);
}

.pager__btn--active:hover {
  background: var(--text);
  color: var(--surface);
}

/* pagination is pure tap target -- it gets the full 44px on touch */
@media (pointer: coarse) {
  .pager {
    gap: var(--s-2);
  }

  .pager__btn {
    min-width: 44px;
    height: 44px;
    font-size: var(--t-md);
  }

  .pager__btn svg {
    width: 18px;
    height: 18px;
  }
}
</style>

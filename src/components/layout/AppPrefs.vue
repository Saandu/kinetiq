<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

/**
 * Language + theme controls, in two presentations.
 *
 * `bar`   — compact, unlabelled, for the desktop top bar.
 * `panel` — labelled rows, for the mobile drawer.
 *
 * On a phone these move into the drawer rather than staying in the top bar:
 * side by side with the page title they forced a second row that cost ~50px of
 * a short viewport, and they gain proper labels down there instead of being
 * two bare letter-pairs.
 */
withDefaults(defineProps<{ variant?: 'bar' | 'panel' }>(), { variant: 'bar' })

const { t } = useI18n()
const ui = useUiStore()
</script>

<template>
  <div :class="['prefs', `prefs--${variant}`]">
    <div class="prefs__group">
      <span v-if="variant === 'panel'" class="prefs__label">{{ t('language.label') }}</span>
      <div class="seg" role="group" :aria-label="t('language.label')">
        <button
          v-for="code in (['en', 'de'] as const)"
          :key="code"
          class="seg__btn"
          :class="{ 'seg__btn--on': ui.locale === code }"
          :aria-pressed="ui.locale === code"
          @click="ui.setLocale(code)"
        >
          {{ variant === 'panel' ? t(`language.${code}`) : code.toUpperCase() }}
        </button>
      </div>
    </div>

    <div class="prefs__group">
      <span v-if="variant === 'panel'" class="prefs__label">{{ t('theme.label') }}</span>

      <div v-if="variant === 'panel'" class="seg" role="group" :aria-label="t('theme.label')">
        <button
          v-for="mode in (['light', 'dark'] as const)"
          :key="mode"
          class="seg__btn"
          :class="{ 'seg__btn--on': ui.theme === mode }"
          :aria-pressed="ui.theme === mode"
          @click="ui.setTheme(mode)"
        >
          {{ t(`theme.${mode}`) }}
        </button>
      </div>

      <button v-else class="prefs__icon" :aria-label="t('theme.toggle')" @click="ui.toggleTheme()">
        <svg v-if="ui.theme === 'dark'" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3.7" fill="currentColor" />
          <path
            d="M10 1.8v2.1M10 16.1v2.1M18.2 10h-2.1M3.9 10H1.8M15.8 4.2l-1.5 1.5M5.7 14.3l-1.5 1.5M15.8 15.8l-1.5-1.5M5.7 5.7 4.2 4.2"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        <svg v-else viewBox="0 0 20 20" aria-hidden="true">
          <path d="M16.4 12.6A7 7 0 0 1 7.4 3.6a7 7 0 1 0 9 9Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.prefs--bar {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.prefs--panel {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.prefs--panel .prefs__group {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.prefs__label {
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.seg {
  display: flex;
  padding: 2px;
  background: var(--surface-inset);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}

.prefs--panel .seg {
  width: 100%;
}

.seg__btn {
  height: 28px;
  padding: 0 var(--s-2);
  border-radius: var(--r-xs);
  color: var(--text-faint);
  font-size: var(--t-xs);
  font-weight: 650;
  letter-spacing: 0.03em;
  transition:
    background-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}

.prefs--panel .seg__btn {
  flex: 1;
  height: 38px;
  font-size: var(--t-base);
  letter-spacing: 0;
}

.seg__btn--on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.prefs__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text-muted);
  transition:
    background-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}

.prefs__icon svg {
  width: 17px;
  height: 17px;
}

.prefs__icon:hover {
  background: var(--surface-hover);
  color: var(--text);
}

@media (pointer: coarse) {
  .prefs--bar .seg__btn {
    height: 40px;
    min-width: 44px;
  }

  .prefs--panel .seg__btn {
    height: 44px;
  }

  .prefs__icon {
    width: 44px;
    height: 44px;
  }

  .prefs__icon svg {
    width: 19px;
    height: 19px;
  }
}
</style>

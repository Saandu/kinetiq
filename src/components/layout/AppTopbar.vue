<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppPrefs from './AppPrefs.vue'
import { useUiStore } from '@/stores/ui'

defineProps<{ title: string; subtitle?: string }>()

const { t } = useI18n()
const ui = useUiStore()
</script>

<template>
  <header class="topbar">
    <button
      class="topbar__burger"
      :aria-label="ui.sidebarOpen ? t('a11y.closeMenu') : t('a11y.openMenu')"
      @click="ui.toggleSidebar()"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M3 5.5h14M3 10h14M3 14.5h14"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <div class="topbar__heading">
      <h1 class="topbar__title">{{ title }}</h1>
      <p v-if="subtitle" class="topbar__subtitle">{{ subtitle }}</p>
    </div>

    <div class="topbar__actions">
      <slot name="actions" />
      <!-- below 600px these live in the drawer instead; see AppSidebar -->
      <AppPrefs variant="bar" class="topbar__prefs" />
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--s-4);
  min-height: var(--topbar-h);
  padding: var(--s-3) var(--s-6);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}

.topbar__burger {
  display: none;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-left: calc(var(--s-2) * -1);
  border-radius: var(--r-sm);
  color: var(--text-muted);
}

.topbar__burger svg {
  width: 20px;
  height: 20px;
}

/* min-width:0 is what actually lets a flex child shrink below its content —
   without it the title floors the row at its intrinsic width and the whole
   bar pushes the document wider than the viewport. */
.topbar__heading {
  flex: 1 1 auto;
  min-width: 0;
}

.topbar__title {
  font-size: var(--t-xl);
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar__subtitle {
  font-size: var(--t-sm);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topbar__actions {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.topbar__icon {
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

.topbar__icon svg {
  width: 17px;
  height: 17px;
}

.topbar__icon:hover {
  background: var(--surface-hover);
  color: var(--text);
}

@media (max-width: 900px) {
  .topbar {
    padding: var(--s-2) var(--s-4);
    /* clears the notch in landscape, no-ops everywhere else */
    padding-left: max(var(--s-4), env(safe-area-inset-left));
    padding-right: max(var(--s-4), env(safe-area-inset-right));
  }

  .topbar__burger {
    display: grid;
  }

  .topbar__subtitle {
    display: none;
  }

  .topbar__title {
    font-size: var(--t-lg);
  }
}

/*
 * Preferences move into the drawer here. Keeping them in the bar alongside a
 * page title and a status badge is what pushed the row past the viewport at
 * ~425px and gave the whole document a horizontal scroll.
 */
@media (max-width: 600px) {
  .topbar__prefs {
    display: none;
  }

  .topbar {
    gap: var(--s-3);
  }
}

@media (pointer: coarse) {
  .topbar__burger {
    width: 44px;
    height: 44px;
  }

  .topbar__burger svg {
    width: 22px;
    height: 22px;
  }
}
</style>

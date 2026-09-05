<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import AppPrefs from './AppPrefs.vue'
import KinetiqMark from '@/components/brand/KinetiqMark.vue'
import { brand } from '@/config/brand'
import { useFleetStore } from '@/stores/fleet'
import { useUiStore } from '@/stores/ui'

const { t } = useI18n()
const route = useRoute()
const fleet = useFleetStore()
const ui = useUiStore()
const panel = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null

watch(() => ui.sidebarOpen, async (open) => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    if (ui.sidebarOpen) panel.value?.querySelector<HTMLElement>('button')?.focus()
  } else {
    await nextTick()
    if (ui.isMobile) {
      const target = previousFocus?.isConnected ? previousFocus : document.querySelector<HTMLElement>('.topbar__burger')
      target?.focus()
    }
    previousFocus = null
  }
})

function onDrawerKey(event: KeyboardEvent) {
  if (!ui.sidebarOpen || !ui.isMobile) return
  if (event.key === 'Escape') {
    event.preventDefault()
    ui.closeSidebar()
  }
  if (event.key !== 'Tab' || !panel.value) return
  const items = Array.from(panel.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'))
    .filter((item) => item.getClientRects().length > 0)
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onBeforeUnmount(() => ui.closeSidebar())

/** The machine-scoped pages are meaningless until a machine is chosen. */
const machineLinks = computed(() => {
  if (!fleet.selectedId) return []
  return [
    { to: `/machines/${fleet.selectedId}`, label: t('nav.machine'), icon: 'machine' },
    {
      to: `/machines/${fleet.selectedId}/notifications`,
      label: t('nav.notifications'),
      icon: 'bell',
    },
    { to: `/machines/${fleet.selectedId}/settings`, label: t('nav.settings'), icon: 'gear' },
  ]
})

function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <aside
    id="app-navigation"
    ref="panel"
    class="sidebar"
    :class="{ 'sidebar--open': ui.sidebarOpen }"
    :inert="ui.isMobile && !ui.sidebarOpen ? true : undefined"
    :role="ui.isMobile && ui.sidebarOpen ? 'dialog' : undefined"
    :aria-modal="ui.isMobile && ui.sidebarOpen ? true : undefined"
    :aria-label="t('a11y.mainNav')"
    @keydown="onDrawerKey"
  >
    <button v-if="ui.isMobile" class="sidebar__close" :aria-label="t('a11y.closeMenu')" @click="ui.closeSidebar()">×</button>
    <RouterLink to="/" class="sidebar__brand" @click="ui.closeSidebar()">
      <KinetiqMark :size="26" />
      <span class="sidebar__brandtext">
        <span class="sidebar__name">{{ brand.name }}</span>
        <span class="sidebar__descriptor">{{ t('app.descriptor') }}</span>
      </span>
    </RouterLink>

    <nav class="sidebar__nav" :aria-label="t('a11y.mainNav')">
      <p class="sidebar__section">{{ t('nav.section.overview') }}</p>
      <RouterLink
        to="/"
        class="sidebar__link"
        :class="{ 'sidebar__link--active': isActive('/') }"
        @click="ui.closeSidebar()"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2.6" y="2.6" width="6.2" height="6.2" rx="1.8" />
          <rect x="11.2" y="2.6" width="6.2" height="6.2" rx="1.8" />
          <rect x="2.6" y="11.2" width="6.2" height="6.2" rx="1.8" />
          <rect x="11.2" y="11.2" width="6.2" height="6.2" rx="1.8" />
        </svg>
        {{ t('nav.dashboard') }}
      </RouterLink>

      <template v-if="machineLinks.length">
        <p class="sidebar__section">{{ t('nav.section.machine') }}</p>
        <p class="sidebar__machine">{{ fleet.selectedId }}</p>

        <RouterLink
          v-for="link in machineLinks"
          :key="link.to"
          :to="link.to"
          class="sidebar__link"
          :class="{ 'sidebar__link--active': isActive(link.to) }"
          @click="ui.closeSidebar()"
        >
          <svg v-if="link.icon === 'machine'" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6" />
            <circle cx="10" cy="10" r="2.1" />
          </svg>
          <svg v-else-if="link.icon === 'bell'" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="M5.6 8.4a4.4 4.4 0 0 1 8.8 0v3l1.4 2.4H4.2L5.6 11.4Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <path
              d="M8.2 16.2a1.9 1.9 0 0 0 3.6 0"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
          <svg v-else viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path
              d="M10 2.4v2.2M10 15.4v2.2M17.6 10h-2.2M4.6 10H2.4M15.4 4.6l-1.6 1.6M6.2 13.8l-1.6 1.6M15.4 15.4l-1.6-1.6M6.2 6.2 4.6 4.6"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
          {{ link.label }}
        </RouterLink>
      </template>
    </nav>

    <div class="sidebar__foot">
      <!-- only rendered here on phones, where the top bar has no room for them -->
      <AppPrefs variant="panel" class="sidebar__prefs" />

      <span class="sidebar__demo">{{ t('demo.badge') }}</span>
      <p class="sidebar__note">{{ t('demo.notice') }}</p>
      <a class="sidebar__source" :href="brand.repoUrl" target="_blank" rel="noopener noreferrer">{{ t('a11y.viewSource') }} ↗</a>
    </div>
  </aside>

  <div v-if="ui.sidebarOpen" class="scrim" @click="ui.closeSidebar()" />
</template>

<style scoped>
.sidebar__close {
  position: absolute;
  top: var(--s-2);
  right: var(--s-2);
  width: 44px;
  height: 44px;
  font-size: var(--t-xl);
  background: var(--surface);
  border-radius: var(--r-sm);
}

.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: var(--z-drawer);
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  background: var(--surface);
  border-right: 1px solid var(--border);
  transition: transform var(--dur) var(--ease-out);
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  height: var(--topbar-h);
  padding: 0 var(--s-5);
  border-bottom: 1px solid var(--border);
  color: var(--text);
}

.sidebar__brandtext {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar__name {
  font-size: var(--t-lg);
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.sidebar__descriptor {
  font-size: var(--t-xs);
  color: var(--text-faint);
  line-height: 1.2;
}

.sidebar__nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--s-4) var(--s-3);
}

.sidebar__section {
  padding: var(--s-3) var(--s-2) var(--s-2);
  font-size: var(--t-xs);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.sidebar__machine {
  padding: 0 var(--s-2) var(--s-2);
  font-family: var(--font-mono);
  font-size: var(--t-sm);
  color: var(--accent-ink);
}

.sidebar__link {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-2);
  margin-bottom: 2px;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  font-size: var(--t-base);
  font-weight: 500;
  transition:
    background-color var(--dur-fast) var(--ease),
    color var(--dur-fast) var(--ease);
}

.sidebar__link svg {
  width: 18px;
  height: 18px;
  flex: none;
  fill: currentColor;
}

.sidebar__link:hover {
  background: var(--surface-inset);
  color: var(--text);
}

.sidebar__link--active {
  background: var(--c-green-soft);
  color: var(--accent-ink);
  font-weight: 600;
}

.sidebar__foot {
  padding: var(--s-4) var(--s-5);
  border-top: 1px solid var(--border);
}

/* mirrors the top bar's 600px handover */
.sidebar__prefs {
  display: none;
}

@media (max-width: 600px) {
  .sidebar__prefs {
    display: flex;
    margin-bottom: var(--s-4);
    padding-bottom: var(--s-4);
    border-bottom: 1px solid var(--border);
  }
}

.sidebar__demo {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 var(--s-2);
  border-radius: var(--r-xs);
  background: var(--c-amber-soft);
  color: var(--c-amber-ink);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sidebar__note {
  margin-top: var(--s-2);
  font-size: var(--t-xs);
  line-height: 1.45;
  color: var(--text-faint);
}

.sidebar__source {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: var(--t-sm);
  color: var(--accent-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-scrim);
  background: rgba(12, 13, 16, 0.5);
}

@media (max-width: 900px) {
  .sidebar {
    visibility: hidden;
    transform: translateX(-100%);
    box-shadow: var(--shadow-lg);
    border-right: none;
    /* the drawer spans the full height, so it owns the safe areas itself */
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
  }

  .sidebar--open {
    visibility: visible;
    transform: translateX(0);
  }
}

@media (pointer: coarse) {
  .sidebar__link {
    min-height: 44px;
    padding: var(--s-2) var(--s-3);
    font-size: var(--t-md);
  }

  .sidebar__link svg {
    width: 20px;
    height: 20px;
  }

  .sidebar__brand {
    min-height: 56px;
  }
}

@media (min-width: 901px) {
  .scrim {
    display: none;
  }
}
</style>

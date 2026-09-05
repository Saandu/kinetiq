import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'
import { readRaw, writeRaw } from '@/services/storage'
import { lockScroll, unlockScroll } from '@/composables/useScrollLock'
import { resolveInitialLocale, setI18nLocale, type AppLocale } from '@/i18n'

export type Theme = 'light' | 'dark'

function resolveInitialTheme(): Theme {
  const stored = readRaw('theme')
  if (stored === 'light' || stored === 'dark') return stored
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export interface Toast {
  id: number
  message: string
  tone: 'good' | 'bad' | 'neutral'
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>(resolveInitialTheme())
  const locale = ref<AppLocale>(resolveInitialLocale())
  const sidebarOpen = ref(false)
  const drawerQuery = window.matchMedia('(max-width: 900px)')
  const isMobile = ref(drawerQuery.matches)
  let drawerLocked = false

  function onBreakpointChange() {
    isMobile.value = drawerQuery.matches
    closeSidebar()
  }
  drawerQuery.addEventListener('change', onBreakpointChange)
  onScopeDispose(() => {
    drawerQuery.removeEventListener('change', onBreakpointChange)
    if (drawerLocked) unlockScroll()
  })
  const toasts = ref<Toast[]>([])

  let toastSeq = 0

  function applyTheme() {
    document.documentElement.dataset.theme = theme.value
    writeRaw('theme', theme.value)
  }

  function setTheme(next: Theme) {
    theme.value = next
    applyTheme()
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function setLocale(next: AppLocale) {
    locale.value = next
    writeRaw('locale', next)
    setI18nLocale(next)
  }

  function toggleLocale() {
    setLocale(locale.value === 'en' ? 'de' : 'en')
  }

  function setSidebar(open: boolean) {
    open = open && isMobile.value
    if (open === sidebarOpen.value) return
    sidebarOpen.value = open
    if (open) {
      lockScroll()
      drawerLocked = true
    } else if (drawerLocked) {
      unlockScroll()
      drawerLocked = false
    }
  }

  function toggleSidebar() {
    setSidebar(!sidebarOpen.value)
  }

  function closeSidebar() {
    setSidebar(false)
  }

  function notify(message: string, tone: Toast['tone'] = 'neutral') {
    const id = ++toastSeq
    toasts.value.push({ id, message, tone })
    window.setTimeout(() => dismissToast(id), 3200)
  }

  function dismissToast(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  /** Called once at startup to sync the DOM with the restored state. */
  function hydrate() {
    applyTheme()
    setI18nLocale(locale.value)
  }

  return {
    theme,
    locale,
    sidebarOpen,
    isMobile,
    toasts,
    setTheme,
    toggleTheme,
    setLocale,
    toggleLocale,
    toggleSidebar,
    closeSidebar,
    notify,
    dismissToast,
    hydrate,
  }
})

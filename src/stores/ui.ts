import { defineStore } from 'pinia'
import { ref } from 'vue'
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

  /** The sidebar only overlays content (and so only locks scroll) on mobile. */
  function isDrawer() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches
  }

  function setSidebar(open: boolean) {
    if (open === sidebarOpen.value) return
    sidebarOpen.value = open
    if (!isDrawer()) return
    if (open) lockScroll()
    else unlockScroll()
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

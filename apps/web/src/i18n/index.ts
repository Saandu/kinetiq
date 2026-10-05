import { createI18n } from 'vue-i18n'
import en from './locales/en'
import de from './locales/de'
import { readRaw } from '@/services/storage'

export const SUPPORTED_LOCALES = ['en', 'de'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

function isSupported(value: string | null): value is AppLocale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Stored choice wins; otherwise fall back to the browser's preference so a
 * German-speaking visitor lands on German without touching anything.
 */
export function resolveInitialLocale(): AppLocale {
  const stored = readRaw('locale')
  if (isSupported(stored)) return stored

  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en'
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: 'en',
  messages: { en, de },
})

export function setI18nLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

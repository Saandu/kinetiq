import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Locale-aware formatting.
 *
 * Intl formatters are expensive to construct and get called once per row per
 * tick, so they are memoised per locale rather than built inline in templates.
 */
export function useFormat() {
  const { locale, t } = useI18n()

  const tag = computed(() => (locale.value === 'de' ? 'de-DE' : 'en-GB'))

  const dateTime = computed(
    () =>
      new Intl.DateTimeFormat(tag.value, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
  )

  const timeOnly = computed(
    () => new Intl.DateTimeFormat(tag.value, { hour: '2-digit', minute: '2-digit' })
  )

  const dateOnly = computed(
    () =>
      new Intl.DateTimeFormat(tag.value, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
  )

  function formatDateTime(ms: number): string {
    return dateTime.value.format(new Date(ms))
  }

  function formatTime(ms: number): string {
    return timeOnly.value.format(new Date(ms))
  }

  function formatDate(ms: number): string {
    return dateOnly.value.format(new Date(ms))
  }

  /** "12 min ago" / "vor 12 Min." — coarse on purpose, this is a status feed. */
  function formatRelative(ms: number, now = Date.now()): string {
    const diffMin = Math.round((now - ms) / 60_000)
    if (diffMin < 1) return t('time.justNow')
    if (diffMin < 60) return t('time.minutesAgo', { n: diffMin })
    return t('time.hoursAgo', { n: Math.round(diffMin / 60) })
  }

  function percent(value: number, decimals = 0): string {
    return `${value.toFixed(decimals)}%`
  }

  return { formatDateTime, formatTime, formatDate, formatRelative, percent }
}

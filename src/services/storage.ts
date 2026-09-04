/**
 * Namespaced, typed localStorage access.
 *
 * Every read is defensive: a portfolio demo gets opened in private windows,
 * with storage disabled, and with stale payloads from an older deploy still
 * sitting in the origin. None of those should white-screen the app, so a bad
 * read degrades to the caller's fallback rather than throwing.
 */

// Versioned so this standalone demo never reads data written by another build.
const PREFIX = 'kinetiq.demo.v1.'

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // storage full or blocked -- the app stays usable, the change just
    // does not survive a reload
  }
}

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    /* ignore */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

/** Wipes every Kinetiq key -- backs the "reset demo" action. */
export function clearAll(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) doomed.push(key)
    }
    doomed.forEach((key) => localStorage.removeItem(key))
  } catch {
    /* ignore */
  }
}

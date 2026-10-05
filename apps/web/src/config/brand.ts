/**
 * Single source of truth for product identity.
 * Renaming the product is a change to this file and nothing else.
 */
export const brand = {
  name: 'Kinetiq',
  /** Shown next to the wordmark in the sidebar. */
  descriptor: 'Condition Monitoring',
  /** Used in <title> and the about panel. */
  tagline: 'Condition monitoring for industrial machines',
  /** Portfolio attribution shown in the demo banner. */
  repoUrl: 'https://github.com/Saandu/kinetiq',
} as const

/**
 * How often the UI recomputes simulated telemetry.
 *
 * Values are computed locally, so this controls render cadence rather than
 * network traffic. Two seconds keeps motion legible without needless updates.
 */
export const TICK_MS = 2000

/** Machines per page on the dashboard list. */
export const PAGE_SIZE = 6

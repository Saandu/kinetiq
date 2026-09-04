/**
 * Deterministic telemetry simulator.
 *
 * This standalone demo synthesises telemetry deterministically: every value is
 * a pure function of (machine id, field name, wall-clock time).
 *
 * That property is what makes the demo behave like a real feed rather than
 * noise:
 *   - reloading the page does not teleport a machine to a different state,
 *     because the value depends on the clock and not on a random seed;
 *   - two browser tabs show the same numbers at the same moment;
 *   - a machine's identity (its baseline health, its fault categories) is
 *     stable forever, because it is hashed from the id;
 *   - values drift smoothly, so CSS transitions have something to animate.
 *
 * There is no backend and no network call anywhere in this file.
 */

import type {
  AlertLevel,
  AlertThresholds,
  FaultCategory,
  FaultWindow,
  Machine,
  MachineNotification,
  MachineStatus,
  MachineTelemetry,
  StateSlice,
} from '@/types/telemetry'
import { FAULT_CATEGORIES } from '@/types/telemetry'

/* ------------------------------------------------------------------ */
/* roster                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fictional roster created for this demo. IDs, names and locations do not map
 * to a real organisation, site or machine.
 */
export const MACHINES: Machine[] = [
  { id: 'DEMO-CNC-01', name: 'Milling cell', kind: 'milling', location: 'Demo floor · Zone A' },
  { id: 'DEMO-DRL-02', name: 'Drill station', kind: 'drilling', location: 'Demo floor · Zone A' },
  { id: 'DEMO-LTH-03', name: 'Turning cell', kind: 'lathe', location: 'Demo floor · Zone B' },
  { id: 'DEMO-PRS-04', name: 'Forming press', kind: 'press', location: 'Demo floor · Zone B' },
  { id: 'DEMO-GRD-05', name: 'Grinding station', kind: 'grinding', location: 'Demo floor · Zone C' },
  { id: 'DEMO-WLD-06', name: 'Welding cell', kind: 'welding', location: 'Demo floor · Zone C' },
  { id: 'DEMO-CNV-07', name: 'Transfer conveyor', kind: 'conveyor', location: 'Demo floor · Zone D' },
  { id: 'DEMO-PMP-08', name: 'Cooling pump', kind: 'pump', location: 'Demo floor · Zone D' },
]

/** Slots available for operating states; machines use a subset. */
export const MAX_STATES = 8

/**
 * Condition profiles.
 *
 * Assigned explicitly rather than hashed, because the roster is a *composition*
 * -- a dashboard where every machine is healthy has nothing to look at, and one
 * where everything is critical reads as broken rather than busy. This spread
 * gives the view a shape: a healthy floor, one machine to watch, one degrading,
 * one down.
 */
type Profile = 'healthy' | 'watch' | 'degraded' | 'critical' | 'offline'

const PROFILES: Record<string, Profile> = {
  'DEMO-CNC-01': 'healthy',
  'DEMO-DRL-02': 'healthy',
  'DEMO-LTH-03': 'watch',
  'DEMO-PRS-04': 'healthy',
  'DEMO-GRD-05': 'degraded',
  'DEMO-WLD-06': 'healthy',
  'DEMO-CNV-07': 'offline',
  'DEMO-PMP-08': 'critical',
}

/** Fictional availability bands chosen to exercise every UI state. */
const BANDS: Record<Profile, [number, number]> = {
  healthy: [91, 99],
  watch: [81, 89],
  degraded: [66, 79],
  critical: [48, 64],
  offline: [0, 0],
}

/** Fictional anomaly bands; lower availability produces a higher score. */
const ANOMALY_BANDS: Record<Profile, [number, number]> = {
  healthy: [2, 12],
  watch: [16, 30],
  degraded: [38, 58],
  critical: [68, 90],
  offline: [0, 0],
}

/** Fictional defaults; users can override these per machine in Settings. */
export const DEMO_ALERT_THRESHOLDS: AlertThresholds = {
  watchBelow: 90,
  warningBelow: 80,
  criticalBelow: 65,
}

/* ------------------------------------------------------------------ */
/* deterministic primitives                                            */
/* ------------------------------------------------------------------ */

/**
 * FNV-1a followed by murmur3's fmix32 finalizer.
 *
 * The finalizer is not optional here. Plain FNV-1a has weak avalanche on the
 * trailing bytes: keys differing only in their last character ("…|cat|0" vs
 * "…|cat|1") land within ~0.01 of each other once scaled to a unit float. That
 * silently collapsed every per-index draw onto the same value -- all three
 * fault categories identical, and drift phases nearly in lockstep across
 * machines. fmix32 spreads the low bits back over the whole word.
 */
function hash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Stable float in [0, 1) for a key. Same key always yields the same number. */
export function stableUnit(...parts: (string | number)[]): number {
  return hash(parts.join('|')) / 0x100000000
}

/** Stable integer in [min, max]. */
export function stableInt(min: number, max: number, ...parts: (string | number)[]): number {
  return min + Math.floor(stableUnit(...parts) * (max - min + 1))
}

/**
 * A slow sine drift between `lo` and `hi`.
 *
 * `period` is the number of seconds for a full cycle. Two harmonics are summed
 * so the motion does not read as an obvious sine wave -- real availability
 * wanders rather than oscillating cleanly.
 */
export function drift(
  key: string,
  lo: number,
  hi: number,
  period = 90,
  now = Date.now()
): number {
  const phase = stableUnit(key, 'phase') * Math.PI * 2
  const phase2 = stableUnit(key, 'phase2') * Math.PI * 2
  const t = (now / 1000 / period) * Math.PI * 2

  const primary = Math.sin(t + phase)
  const secondary = Math.sin(t * 2.7 + phase2) * 0.35
  const unit = (primary + secondary + 1.35) / 2.7 // -> roughly 0..1

  const clamped = Math.min(1, Math.max(0, unit))
  return lo + clamped * (hi - lo)
}

/* ------------------------------------------------------------------ */
/* machine identity                                                    */
/* ------------------------------------------------------------------ */

/** A machine's fixed character: its condition band and how many states it uses. */
function baseline(id: string) {
  const profile = PROFILES[id] ?? 'healthy'
  return {
    profile,
    band: BANDS[profile],
    /** how many operating states this machine distinguishes */
    activeStates: stableInt(3, 6, id, 'states'),
    offline: profile === 'offline',
  }
}

/**
 * Alert severity is derived from availability rather than generated
 * separately, so the icon can never disagree with the number beside it.
 */
export function alertFor(
  availability: number,
  thresholds: AlertThresholds = DEMO_ALERT_THRESHOLDS
): AlertLevel {
  if (availability >= thresholds.watchBelow) return 0
  if (availability >= thresholds.warningBelow) return 1
  if (availability >= thresholds.criticalBelow) return 2
  return 3
}

/** Fault categories this machine is prone to -- stable per machine. */
function categoriesFor(id: string): FaultCategory[] {
  return [0, 1, 2].map(
    (n) => FAULT_CATEGORIES[stableInt(0, FAULT_CATEGORIES.length - 1, id, 'cat', n)]
  )
}

/* ------------------------------------------------------------------ */
/* status (dashboard list)                                             */
/* ------------------------------------------------------------------ */

export function machineStatus(
  id: string,
  now = Date.now(),
  thresholds: AlertThresholds = DEMO_ALERT_THRESHOLDS
): MachineStatus {
  const base = baseline(id)

  if (base.offline) {
    return { id, online: false, availability: 0, alert: 3 }
  }

  const [lo, hi] = base.band
  const availability = drift(`${id}:availability`, lo, hi, 120, now)

  return {
    id,
    online: true,
    availability: round(availability, 1),
    alert: alertFor(availability, thresholds),
  }
}

export function allMachineStatuses(
  now = Date.now(),
  thresholdsFor?: (id: string) => AlertThresholds
): MachineStatus[] {
  return MACHINES.map((m) => machineStatus(m.id, now, thresholdsFor?.(m.id)))
}

/* ------------------------------------------------------------------ */
/* telemetry (detail view)                                             */
/* ------------------------------------------------------------------ */

function stateDistribution(id: string, activeStates: number, now: number): StateSlice[] {
  const raw: number[] = []
  for (let i = 0; i < activeStates; i++) {
    raw.push(drift(`${id}:state:${i}`, 0.06, 1, 60 + i * 11, now))
  }
  const total = raw.reduce((a, b) => a + b, 0)
  return raw.map((value, index) => ({ index, share: value / total }))
}

function windowsFor(
  id: string,
  scope: 'maintenance' | 'fault',
  now: number
): { previous: FaultWindow; current: FaultWindow; next: FaultWindow } {
  const [a, b, c] = categoriesFor(`${id}:${scope}`)
  const hour = 3600_000

  return {
    previous: {
      category: a,
      at: now - (2 + stableUnit(id, scope, 'p') * 3) * hour,
      interval: '1h',
    },
    current: {
      category: b,
      at: now - (0.2 + stableUnit(id, scope, 'c') * 0.8) * hour,
      interval: '15min',
    },
    next: {
      category: c,
      at: now + (0.3 + stableUnit(id, scope, 'n') * 1.2) * hour,
      until: now + (1.4 + stableUnit(id, scope, 'u') * 1.6) * hour,
    },
  }
}

export function machineTelemetry(id: string, now = Date.now()): MachineTelemetry {
  const base = baseline(id)
  const status = machineStatus(id, now)
  const states = stateDistribution(id, base.activeStates, now)

  // the "current" state is whichever slice is largest right now
  let currentState = 0
  for (let i = 1; i < states.length; i++) {
    if (states[i].share > states[currentState].share) currentState = i
  }

  return {
    id,
    online: status.online,
    availability: status.availability,
    anomalyScore: round(
      drift(`${id}:anomaly`, ANOMALY_BANDS[base.profile][0], ANOMALY_BANDS[base.profile][1], 75, now),
      1
    ),
    confidence: round(drift(`${id}:confidence`, 0.62, 0.99, 100, now), 3),
    activeStates: base.activeStates,
    states,
    currentState,
    maintenance: windowsFor(id, 'maintenance', now),
    faults: windowsFor(id, 'fault', now),
    // defaults; the store overlays whatever the user has toggled locally
    maintenanceMode: false,
    monitoringEnabled: true,
  }
}

/* ------------------------------------------------------------------ */
/* notifications                                                       */
/* ------------------------------------------------------------------ */

const NOTIFICATIONS_PER_MACHINE = 7

/**
 * Notifications are pinned to a coarse time bucket rather than to `now`, so
 * the list does not reshuffle on every tick. It advances once every 10 minutes,
 * which is frequent enough to feel alive across a session.
 */
export function machineNotifications(
  id: string,
  now = Date.now(),
  thresholds: AlertThresholds = DEMO_ALERT_THRESHOLDS
): MachineNotification[] {
  const bucket = Math.floor(now / 600_000)
  const base = baseline(id)
  const out: MachineNotification[] = []

  /**
   * Availability sampled around the machine's own band, widened so the history
   * contains both good and bad news rather than a flat line.
   */
  const sample = (seedAt: number): number => {
    const [lo, hi] = base.band
    const spread = Math.max(18, hi - lo)
    const centre = base.profile === 'offline' ? 45 : (lo + hi) / 2
    return round(
      Math.min(99, Math.max(20, centre - spread + stableUnit(id, 'navail', seedAt) * spread * 2)),
      0
    )
  }

  for (let i = 0; i < NOTIFICATIONS_PER_MACHINE; i++) {
    const seedAt = bucket - i
    const at = seedAt * 600_000 - stableInt(0, 540_000, id, 'jitter', seedAt)

    const availability = sample(seedAt)
    // "rose to X" has to mean rose *relative to the previous reading* -- against
    // a fixed threshold a healthy machine reports nothing but rises forever
    const good = availability >= sample(seedAt - 1)
    const level = alertFor(availability, thresholds)

    const activeStates = base.activeStates
    const raw = Array.from({ length: activeStates }, (_, s) =>
      stableUnit(id, 'nstate', seedAt, s) + 0.06
    )
    const total = raw.reduce((a, b) => a + b, 0)

    out.push({
      id: `${id}-${seedAt}`,
      machineId: id,
      at,
      level,
      messageKey: good ? 'notifications.messages.rose' : 'notifications.messages.fell',
      value: `${availability}%`,
      tone: good ? 'good' : 'bad',
      snapshot: {
        availability,
        anomalyScore: round(stableUnit(id, 'nanom', seedAt) * 90, 1),
        confidence: round(0.6 + stableUnit(id, 'nconf', seedAt) * 0.39, 3),
        activeStates,
        states: raw.map((value, index) => ({ index, share: value / total })),
        interval: '1h',
      },
    })
  }

  return out.sort((a, b) => b.at - a.at)
}

/* ------------------------------------------------------------------ */

function round(value: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

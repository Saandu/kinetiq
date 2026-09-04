/** Severity ladder used for both machine alerts and notifications. */
export type AlertLevel = 0 | 1 | 2 | 3

/** Machine categories -- the key is translated for display. */
export type MachineKind =
  | 'milling'
  | 'drilling'
  | 'lathe'
  | 'press'
  | 'grinding'
  | 'welding'
  | 'conveyor'
  | 'pump'

/** Maintenance/fault categories -- the key is translated for display. */
export type FaultCategory =
  | 'inspection'
  | 'adjustment'
  | 'mechanical'
  | 'electrical'
  | 'lubrication'

export const FAULT_CATEGORIES: FaultCategory[] = [
  'inspection',
  'adjustment',
  'mechanical',
  'electrical',
  'lubrication',
]

/** Fictional demo thresholds used to map availability to severity. */
export interface AlertThresholds {
  watchBelow: number
  warningBelow: number
  criticalBelow: number
}

/** A machine as it appears in the roster -- static identity, no telemetry. */
export interface Machine {
  id: string
  name: string
  kind: MachineKind
  location: string
}

/** The rolled-up row shown on the dashboard list. */
export interface MachineStatus {
  id: string
  online: boolean
  /** 0..100 */
  availability: number
  alert: AlertLevel
}

/** One entry in a machine's operating-state distribution. */
export interface StateSlice {
  index: number
  /** 0..1, the slices of a machine sum to 1 */
  share: number
}

/** A predicted or recorded maintenance/fault window. */
export interface FaultWindow {
  category: FaultCategory
  /** epoch ms */
  at: number
  /** epoch ms -- only set for predicted (future) windows */
  until?: number
  /** e.g. "1h", "15min" -- the gap to the neighbouring window */
  interval?: string
}

/** Everything the machine detail view renders. */
export interface MachineTelemetry {
  id: string
  online: boolean
  /** 0..100 */
  availability: number
  /** 0..100 */
  anomalyScore: number
  /** 0..1 */
  confidence: number
  /** how many of the 8 state slots this machine actually uses */
  activeStates: number
  states: StateSlice[]
  /** index of the state the machine is in right now */
  currentState: number
  maintenance: {
    previous: FaultWindow
    current: FaultWindow
    next: FaultWindow
  }
  faults: {
    previous: FaultWindow
    current: FaultWindow
    next: FaultWindow
  }
  maintenanceMode: boolean
  monitoringEnabled: boolean
}

/** A rich-text run inside a notification message. */
export interface NotificationRun {
  /** i18n key when `kind` is 'text', a literal value when 'value' */
  text: string
  kind: 'text' | 'value'
  tone?: 'good' | 'bad' | 'neutral'
}

export interface MachineNotification {
  id: string
  machineId: string
  /** epoch ms */
  at: number
  level: AlertLevel
  /** i18n key for the message template */
  messageKey: string
  /** interpolated into the message */
  value: string
  tone: 'good' | 'bad'
  /** snapshot of the machine at the moment the notification fired */
  snapshot: {
    availability: number
    anomalyScore: number
    confidence: number
    activeStates: number
    states: StateSlice[]
    interval: string
  }
}

/** Per-machine configuration stored only in this browser. */
export interface MachineSettings {
  /** user-supplied overrides; empty string falls back to the translated default */
  stateNames: string[]
  alertThresholds: AlertThresholds
}

/** Locally-recorded maintenance entry (the "add fault data" action). */
export interface MaintenanceEntry {
  id: string
  machineId: string
  category: FaultCategory
  /** epoch ms */
  at: number
}

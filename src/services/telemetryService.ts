/**
 * The data seam.
 *
 * Stores and components use domain methods instead of depending on storage
 * details. This demo implementation combines generated telemetry with local
 * browser persistence.
 */

import type {
  FaultCategory,
  Machine,
  MachineNotification,
  MachineSettings,
  MachineStatus,
  MachineTelemetry,
  MaintenanceEntry,
} from '@/types/telemetry'
import { FAULT_CATEGORIES } from '@/types/telemetry'
import {
  MACHINES,
  DEMO_ALERT_THRESHOLDS,
  MAX_STATES,
  allMachineStatuses,
  machineNotifications,
  machineTelemetry,
} from './simulator'
import { readJson, writeJson } from './storage'

/** Local, user-authored state that overlays the simulated feed. */
interface Overrides {
  /** machines removed from the roster by the user */
  hiddenMachines: string[]
  /** notifications dismissed by the user */
  dismissedNotifications: string[]
  /** per-machine mode toggles */
  modes: Record<string, { maintenance?: boolean; monitoring?: boolean }>
  /** per-machine settings edits */
  settings: Record<string, MachineSettings>
  /** manually logged maintenance */
  entries: MaintenanceEntry[]
}

function emptyOverrides(): Overrides {
  return {
    hiddenMachines: [],
    dismissedNotifications: [],
    modes: {},
    settings: {},
    entries: [],
  }
}

export function defaultSettings(): MachineSettings {
  return {
    stateNames: Array.from({ length: MAX_STATES }, () => ''),
    alertThresholds: { ...DEMO_ALERT_THRESHOLDS },
  }
}

export interface TelemetrySource {
  listMachines(): Machine[]
  listStatuses(now?: number): MachineStatus[]
  getTelemetry(id: string, now?: number): MachineTelemetry | null
  listNotifications(id: string, now?: number): MachineNotification[]

  removeMachine(id: string): void
  restoreAllMachines(): void

  dismissNotification(id: string): void

  setMaintenanceMode(id: string, on: boolean): void
  setMonitoringEnabled(id: string, on: boolean): void

  getSettings(id: string): MachineSettings
  saveSettings(id: string, settings: MachineSettings): void

  listMaintenanceEntries(id: string): MaintenanceEntry[]
  addMaintenanceEntry(id: string, category: FaultCategory, at: number): MaintenanceEntry
}

class LocalTelemetrySource implements TelemetrySource {
  private overrides: Overrides

  constructor() {
    const raw = readJson<unknown>('overrides', {})
    const stored = isRecord(raw) ? raw : {}
    this.overrides = {
      ...emptyOverrides(),
      hiddenMachines: stringArray(stored.hiddenMachines),
      dismissedNotifications: stringArray(stored.dismissedNotifications),
      modes: recordOrEmpty(stored.modes) as Overrides['modes'],
      settings: recordOrEmpty(stored.settings) as Overrides['settings'],
      entries: maintenanceEntries(stored.entries),
    }
  }

  private persist() {
    writeJson('overrides', this.overrides)
  }

  listMachines(): Machine[] {
    return MACHINES.filter((m) => !this.overrides.hiddenMachines.includes(m.id))
  }

  listStatuses(now = Date.now()): MachineStatus[] {
    return allMachineStatuses(now, (id) => this.getSettings(id).alertThresholds).filter(
      (s) => !this.overrides.hiddenMachines.includes(s.id)
    )
  }

  getTelemetry(id: string, now = Date.now()): MachineTelemetry | null {
    if (!MACHINES.some((m) => m.id === id)) return null
    if (this.overrides.hiddenMachines.includes(id)) return null

    const telemetry = machineTelemetry(id, now)
    const modes = this.overrides.modes[id]
    if (modes?.maintenance !== undefined) telemetry.maintenanceMode = modes.maintenance
    if (modes?.monitoring !== undefined) telemetry.monitoringEnabled = modes.monitoring
    return telemetry
  }

  listNotifications(id: string, now = Date.now()): MachineNotification[] {
    return machineNotifications(id, now, this.getSettings(id).alertThresholds).filter(
      (n) => !this.overrides.dismissedNotifications.includes(n.id)
    )
  }

  removeMachine(id: string): void {
    if (!this.overrides.hiddenMachines.includes(id)) {
      this.overrides.hiddenMachines.push(id)
      this.persist()
    }
  }

  restoreAllMachines(): void {
    this.overrides.hiddenMachines = []
    this.overrides.dismissedNotifications = []
    this.persist()
  }

  dismissNotification(id: string): void {
    if (!this.overrides.dismissedNotifications.includes(id)) {
      this.overrides.dismissedNotifications.push(id)
      this.persist()
    }
  }

  setMaintenanceMode(id: string, on: boolean): void {
    this.overrides.modes[id] = { ...this.overrides.modes[id], maintenance: on }
    this.persist()
  }

  setMonitoringEnabled(id: string, on: boolean): void {
    this.overrides.modes[id] = { ...this.overrides.modes[id], monitoring: on }
    this.persist()
  }

  getSettings(id: string): MachineSettings {
    return normalizeSettings(this.overrides.settings[id])
  }

  saveSettings(id: string, settings: MachineSettings): void {
    this.overrides.settings[id] = normalizeSettings(settings)
    this.persist()
  }

  listMaintenanceEntries(id: string): MaintenanceEntry[] {
    return this.overrides.entries
      .filter((e) => e.machineId === id)
      .sort((a, b) => b.at - a.at)
  }

  addMaintenanceEntry(id: string, category: FaultCategory, at: number): MaintenanceEntry {
    const entry: MaintenanceEntry = {
      id: crypto.randomUUID(),
      machineId: id,
      category,
      at,
    }
    this.overrides.entries.push(entry)
    this.persist()
    return entry
  }
}

let source: TelemetrySource = new LocalTelemetrySource()

/** Replace the source without coupling pages or stores to an implementation. */
export function setTelemetrySource(next: TelemetrySource): void {
  source = next
}

export function telemetry(): TelemetrySource {
  return source
}

/** Re-reads overrides from storage -- used after "reset demo". */
export function reloadTelemetrySource(): void {
  source = new LocalTelemetrySource()
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function maintenanceEntries(value: unknown): MaintenanceEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is MaintenanceEntry =>
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      typeof entry.machineId === 'string' &&
      MACHINES.some((machine) => machine.id === entry.machineId) &&
      typeof entry.category === 'string' &&
      FAULT_CATEGORIES.includes(entry.category as FaultCategory) &&
      typeof entry.at === 'number' &&
      Number.isFinite(entry.at)
  )
}

function normalizeSettings(value: unknown): MachineSettings {
  const fallback = defaultSettings()
  if (!isRecord(value)) return fallback

  const rawNames = value.stateNames
  const stateNames = Array.isArray(rawNames)
    ? Array.from({ length: MAX_STATES }, (_, index) => {
        const name = rawNames[index]
        return typeof name === 'string' ? name : ''
      })
    : fallback.stateNames

  const rawThresholds = isRecord(value.alertThresholds) ? value.alertThresholds : {}
  const alertThresholds = {
    watchBelow: percentageOr(rawThresholds.watchBelow, fallback.alertThresholds.watchBelow),
    warningBelow: percentageOr(rawThresholds.warningBelow, fallback.alertThresholds.warningBelow),
    criticalBelow: percentageOr(rawThresholds.criticalBelow, fallback.alertThresholds.criticalBelow),
  }

  const ordered =
    alertThresholds.criticalBelow < alertThresholds.warningBelow &&
    alertThresholds.warningBelow < alertThresholds.watchBelow

  return {
    stateNames,
    alertThresholds: ordered ? alertThresholds : fallback.alertThresholds,
  }
}

function percentageOr(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : fallback
}

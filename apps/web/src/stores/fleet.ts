import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'
import { TICK_MS } from '@/config/brand'
import { telemetry as source, reloadTelemetrySource, defaultSettings } from '@/services/telemetryService'
import { clearAll, readRaw, writeRaw } from '@/services/storage'
import type {
  AlertLevel, FaultCategory, Machine, MachineNotification, MachineSettings,
  MachineStatus, MachineTelemetry, MaintenanceEntry,
} from '@/types/telemetry'

/** Resolved snapshots live here; computed getters never issue requests. */
export const useFleetStore = defineStore('fleet', () => {
  const now = ref(Date.now())
  const selectedId = ref(readRaw('selectedMachine') ?? '')
  const revision = ref(0)
  const machines = ref<Machine[]>([])
  const statuses = ref<MachineStatus[]>([])
  const selectedTelemetry = ref<MachineTelemetry | null>(null)
  const selectedNotifications = ref<MachineNotification[]>([])
  const maintenanceEntries = ref<MaintenanceEntry[]>([])
  const selectedSettings = ref<MachineSettings>(defaultSettings())
  const fleetLoading = ref(false)
  const selectedLoading = ref(false)
  const loaded = ref(false)
  const fleetError = ref(false)
  const selectedError = ref(false)
  const writeError = ref(false)
  const writing = ref(false)
  const loading = computed(() => fleetLoading.value || selectedLoading.value)
  const error = computed(() => fleetError.value || selectedError.value || writeError.value)
  let fleetRequest = 0
  let selectedRequest = 0
  let disposed = false

  async function loadFleet(): Promise<boolean> {
    const request = ++fleetRequest
    const adapter = source()
    fleetLoading.value = true
    fleetError.value = false
    try {
      const [roster, rows] = await Promise.all([adapter.listMachines(), adapter.listStatuses(now.value)])
      if (disposed || request !== fleetRequest || adapter !== source()) return false
      machines.value = roster
      statuses.value = rows
      loaded.value = true
      if (selectedId.value && !roster.some((machine) => machine.id === selectedId.value)) {
        void select('')
      }
      return true
    } catch {
      if (!disposed && request === fleetRequest) fleetError.value = true
      return false
    } finally {
      if (!disposed && request === fleetRequest) fleetLoading.value = false
    }
  }

  function clearSelectionData() {
    selectedTelemetry.value = null
    selectedNotifications.value = []
    maintenanceEntries.value = []
    selectedSettings.value = defaultSettings()
  }

  async function loadSelected(): Promise<boolean> {
    const request = ++selectedRequest
    const id = selectedId.value
    const adapter = source()
    selectedError.value = false
    if (!id) {
      clearSelectionData()
      selectedLoading.value = false
      return true
    }
    selectedLoading.value = true
    try {
      const [details, notifications, entries, settings] = await Promise.all([
        adapter.getTelemetry(id, now.value), adapter.listNotifications(id, now.value),
        adapter.listMaintenanceEntries(id), adapter.getSettings(id),
      ])
      if (disposed || request !== selectedRequest || id !== selectedId.value || adapter !== source()) return false
      selectedTelemetry.value = details
      selectedNotifications.value = notifications
      maintenanceEntries.value = entries
      selectedSettings.value = settings
      return true
    } catch {
      if (!disposed && request === selectedRequest) selectedError.value = true
      return false
    } finally {
      if (!disposed && request === selectedRequest) selectedLoading.value = false
    }
  }

  async function refresh(): Promise<boolean> {
    revision.value++
    const results = await Promise.all([loadFleet(), loadSelected()])
    return results.every(Boolean)
  }

  async function select(id: string): Promise<boolean> {
    if (id !== selectedId.value) clearSelectionData()
    selectedId.value = id
    writeRaw('selectedMachine', id)
    return loadSelected()
  }

  let timer: number | null = null
  let subscribers = 0
  function tick() {
    now.value = Date.now()
    // One in-flight poll at a time; explicit navigation may supersede it.
    if (!loading.value && !writing.value) void refresh()
  }
  function start() {
    if (timer === null) timer = window.setInterval(tick, TICK_MS)
  }
  function stop() {
    if (timer !== null) window.clearInterval(timer)
    timer = null
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') { tick(); start() }
    else stop()
  }
  function subscribe(): () => void {
    if (subscribers === 0) {
      document.addEventListener('visibilitychange', onVisibilityChange)
      if (document.visibilityState === 'visible') { tick(); start() }
    }
    subscribers++
    let released = false
    return () => {
      if (released) return
      released = true
      subscribers--
      if (subscribers === 0) {
        document.removeEventListener('visibilitychange', onVisibilityChange)
        stop()
      }
    }
  }
  onScopeDispose(() => {
    disposed = true
    fleetRequest++
    selectedRequest++
    stop()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  const summary = computed(() => {
    const list = statuses.value
    return {
      total: list.length,
      online: list.filter((s) => s.online).length,
      alerts: list.filter((s) => s.alert >= 2).length,
      highestAlert: list.reduce<AlertLevel>((highest, s) => s.alert > highest ? s.alert : highest, 0),
      avgAvailability: list.length ? list.reduce((sum, s) => sum + s.availability, 0) / list.length : 0,
    }
  })
  const selectedMachine = computed(() => machines.value.find((m) => m.id === selectedId.value) ?? null)

  /** No optimistic writes: refresh only after persistence succeeds. */
  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    if (writing.value || disposed) return false
    writing.value = true
    writeError.value = false
    try {
      await action()
      if (disposed) return false
      await refresh()
      return true
    } catch {
      if (!disposed) writeError.value = true
      return false
    } finally {
      if (!disposed) writing.value = false
    }
  }
  function removeMachine(id: string) { return mutate(() => source().removeMachine(id)) }
  function restoreMachines() { return mutate(() => source().restoreAllMachines()) }
  function dismissNotification(id: string) { return mutate(() => source().dismissNotification(id)) }
  function setMaintenanceMode(on: boolean) {
    const id = selectedId.value
    return id ? mutate(() => source().setMaintenanceMode(id, on)) : Promise.resolve(false)
  }
  function setMonitoringEnabled(on: boolean) {
    const id = selectedId.value
    return id ? mutate(() => source().setMonitoringEnabled(id, on)) : Promise.resolve(false)
  }
  function addMaintenanceEntry(category: FaultCategory, at: number) {
    const id = selectedId.value
    return id ? mutate(() => source().addMaintenanceEntry(id, category, at)) : Promise.resolve(false)
  }
  function resetDemo() {
    return mutate(async () => {
      clearAll()
      reloadTelemetrySource()
      selectedId.value = ''
      selectedRequest++
      clearSelectionData()
    })
  }

  return {
    now, selectedId, revision, machines, statuses, summary, selectedMachine,
    selectedTelemetry, selectedNotifications, maintenanceEntries, selectedSettings,
    fleetLoading, selectedLoading, loading, loaded, fleetError, selectedError,
    writeError, error, writing, loadFleet, loadSelected, refresh, subscribe, select,
    removeMachine, restoreMachines, dismissNotification, setMaintenanceMode,
    setMonitoringEnabled, addMaintenanceEntry, resetDemo,
  }
})

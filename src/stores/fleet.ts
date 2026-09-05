import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { TICK_MS } from '@/config/brand'
import { telemetry as source, reloadTelemetrySource } from '@/services/telemetryService'
import { clearAll } from '@/services/storage'
import { readRaw, writeRaw } from '@/services/storage'
import type { AlertLevel, FaultCategory } from '@/types/telemetry'

/**
 * The fleet store owns the app's single clock.
 *
 * One timer advances one `now` ref, and every derived value is a `computed` off
 * it. This keeps every panel on screen aligned to the same instant.
 */
export const useFleetStore = defineStore('fleet', () => {
  const now = ref(Date.now())
  const storedSelection = readRaw('selectedMachine')
  const selectedId = ref<string>(
    storedSelection && source().listMachines().some((machine) => machine.id === storedSelection)
      ? storedSelection
      : ''
  )

  /** Bumped when local overrides change, to invalidate the computeds. */
  const revision = ref(0)

  let timer: number | null = null
  let subscribers = 0

  function tick() {
    now.value = Date.now()
  }

  function onVisibilityChange() {
    // no point animating gauges nobody is looking at
    if (document.visibilityState === 'visible') {
      tick()
      start()
    } else {
      stop()
    }
  }

  function start() {
    if (timer !== null) return
    timer = window.setInterval(tick, TICK_MS)
  }

  function stop() {
    if (timer === null) return
    window.clearInterval(timer)
    timer = null
  }

  /** Ref-counted so any number of components can ask for a live feed. */
  function subscribe(): () => void {
    if (subscribers === 0) {
      document.addEventListener('visibilitychange', onVisibilityChange)
      if (document.visibilityState === 'visible') start()
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

  /* ---- derived ---------------------------------------------------- */

  const machines = computed(() => {
    void revision.value
    return source().listMachines()
  })

  const statuses = computed(() => {
    void revision.value
    return source().listStatuses(now.value)
  })

  const summary = computed(() => {
    const list = statuses.value
    const online = list.filter((s) => s.online).length
    const alerts = list.filter((s) => s.alert >= 2).length
    const highestAlert = list.reduce<AlertLevel>(
      (highest, status) => (status.alert > highest ? status.alert : highest),
      0
    )
    const avg = list.length
      ? list.reduce((sum, s) => sum + s.availability, 0) / list.length
      : 0
    return { total: list.length, online, alerts, highestAlert, avgAvailability: avg }
  })

  const selectedMachine = computed(
    () => machines.value.find((m) => m.id === selectedId.value) ?? null
  )

  const selectedTelemetry = computed(() => {
    void revision.value
    if (!selectedId.value) return null
    return source().getTelemetry(selectedId.value, now.value)
  })

  const selectedNotifications = computed(() => {
    void revision.value
    if (!selectedId.value) return []
    return source().listNotifications(selectedId.value, now.value)
  })

  const maintenanceEntries = computed(() => {
    void revision.value
    if (!selectedId.value) return []
    return source().listMaintenanceEntries(selectedId.value)
  })

  /* ---- actions ---------------------------------------------------- */

  function select(id: string) {
    selectedId.value = id
    writeRaw('selectedMachine', id)
  }

  function removeMachine(id: string) {
    source().removeMachine(id)
    if (selectedId.value === id) select('')
    revision.value++
  }

  function restoreMachines() {
    source().restoreAllMachines()
    revision.value++
  }

  function dismissNotification(id: string) {
    source().dismissNotification(id)
    revision.value++
  }

  function setMaintenanceMode(on: boolean) {
    if (!selectedId.value) return
    source().setMaintenanceMode(selectedId.value, on)
    revision.value++
  }

  function setMonitoringEnabled(on: boolean) {
    if (!selectedId.value) return
    source().setMonitoringEnabled(selectedId.value, on)
    revision.value++
  }

  function addMaintenanceEntry(category: FaultCategory, at: number) {
    if (!selectedId.value) return
    source().addMaintenanceEntry(selectedId.value, category, at)
    revision.value++
  }

  function resetDemo() {
    clearAll()
    reloadTelemetrySource()
    selectedId.value = ''
    revision.value++
  }

  return {
    now,
    selectedId,
    machines,
    statuses,
    summary,
    selectedMachine,
    selectedTelemetry,
    selectedNotifications,
    maintenanceEntries,
    subscribe,
    select,
    removeMachine,
    restoreMachines,
    dismissNotification,
    setMaintenanceMode,
    setMonitoringEnabled,
    addMaintenanceEntry,
    resetDemo,
  }
})

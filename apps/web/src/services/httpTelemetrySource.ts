import { machineListSchema, statusListSchema, machineTelemetrySchema, notificationListSchema, maintenanceListSchema, machineSettingsSchema, type ApiPaths } from '@kinetiq/contracts'
import type { TelemetrySource } from './telemetryService'

export class HttpTelemetrySource implements TelemetrySource {
  readonly readOnly = true
  constructor(private readonly base = '/v1', private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    if (!/^\/[A-Za-z0-9/_-]+$/.test(base) || base.startsWith('//')) throw new Error('API base must be a same-origin path')
  }
  private async get<T>(path: string, schema: { parse(input: unknown): T }): Promise<T> {
    const response = await this.fetcher(`${this.base}${path}`, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`API read failed (${response.status})`)
    return schema.parse(await response.json())
  }
  listMachines(): Promise<ApiPaths["/v1/machines"]["get"]["responses"][200]["content"]["application/json"]> { return this.get('/machines', machineListSchema) }
  listStatuses() { return this.get('/machines/status', statusListSchema) }
  async getTelemetry(id: string) {
    const response = await this.fetcher(`${this.base}/machines/${encodeURIComponent(id)}/telemetry`, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10_000) })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`API read failed (${response.status})`)
    return machineTelemetrySchema.parse(await response.json())
  }
  listNotifications(id: string) { return this.get(`/machines/${encodeURIComponent(id)}/alerts`, notificationListSchema) }
  getSettings(id: string) { return this.get(`/machines/${encodeURIComponent(id)}/settings`, machineSettingsSchema) }
  listMaintenanceEntries(id: string) { return this.get(`/machines/${encodeURIComponent(id)}/maintenance`, maintenanceListSchema) }
  private async denied(): Promise<never> { throw new Error('The local backend is read-only') }
  removeMachine() { return this.denied() }
  restoreAllMachines() { return this.denied() }
  dismissNotification() { return this.denied() }
  setMaintenanceMode() { return this.denied() }
  setMonitoringEnabled() { return this.denied() }
  saveSettings() { return this.denied() }
  addMaintenanceEntry() { return this.denied() }
}

import { describe, expect, it, vi } from 'vitest'
import { HttpTelemetrySource } from '../src/services/httpTelemetrySource'
import { setTelemetrySource } from '../src/services/telemetryService'
import { useFleetStore } from '../src/stores/fleet'

const machines = [{ id: 'DEMO-CNC-01', name: 'CNC', kind: 'milling', location: 'Floor' }]

describe('HTTP telemetry boundary', () => {
  it('keeps outage feedback visible during a retry and clears it only on recovery', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 503 }))
    setTelemetrySource(new HttpTelemetrySource('/v1', fetcher))
    const fleet = useFleetStore()
    expect(await fleet.refresh()).toBe(false)
    expect(fleet.fleetError).toBe(true)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    fetcher.mockImplementation(async (url) => {
      await gate
      return new Response(JSON.stringify(String(url).endsWith('/status')
        ? [{ id: 'DEMO-CNC-01', online: false, availability: null, alert: 0, samples: 0 }] : machines))
    })
    const retry = fleet.refresh()
    expect(fleet.fleetError).toBe(true)
    release()
    expect(await retry).toBe(true)
    expect(fleet.fleetError).toBe(false)
  })
  it('reads validated data through the same origin without caching sensor responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(machines)))
    const source = new HttpTelemetrySource('/v1', fetcher)
    expect(await source.listMachines()).toEqual(machines)
    expect(fetcher).toHaveBeenCalledWith('/v1/machines', expect.objectContaining({ method: 'GET', credentials: 'same-origin', cache: 'no-store' }))
    expect(() => new HttpTelemetrySource('https://example.com')).toThrow('same-origin')
  })
  it('surfaces invalid responses and outages instead of generating replacement data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('[{"id":"broken"}]'))
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
    const source = new HttpTelemetrySource('/v1', fetcher)
    await expect(source.listMachines()).rejects.toThrow()
    await expect(source.listMachines()).rejects.toThrow('503')
    await expect(source.listMachines()).rejects.toThrow('Network unavailable')
  })
  it('treats a missing machine as absent and refuses every write without a request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }))
    const source = new HttpTelemetrySource('/v1', fetcher)
    expect(await source.getTelemetry('DEMO-CNC-01')).toBeNull()
    fetcher.mockClear()
    for (const write of [() => source.removeMachine(), () => source.restoreAllMachines(), () => source.dismissNotification(),
      () => source.setMaintenanceMode(), () => source.setMonitoringEnabled(), () => source.saveSettings(), () => source.addMaintenanceEntry()]) {
      await expect(write()).rejects.toThrow('read-only')
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps missing availability unknown in fleet totals and blocks store mutations', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(JSON.stringify(String(url).endsWith('/status')
      ? [{ id: 'DEMO-CNC-01', online: false, availability: null, alert: 0, samples: 0 }] : machines)))
    setTelemetrySource(new HttpTelemetrySource('/v1', fetcher))
    const fleet = useFleetStore()
    await fleet.refresh()
    expect(fleet.readOnly).toBe(true)
    expect(fleet.summary.avgAvailability).toBeNull()
    expect(await fleet.removeMachine('DEMO-CNC-01')).toBe(false)
    expect(fleet.machines).toHaveLength(1)
  })
})

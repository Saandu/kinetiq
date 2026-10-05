import { afterEach, beforeEach, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { reloadTelemetrySource } from '../src/services/telemetryService'

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  localStorage.clear()
  reloadTelemetrySource()
  pinia = createPinia()
  setActivePinia(pinia)
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  disposePinia(pinia)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

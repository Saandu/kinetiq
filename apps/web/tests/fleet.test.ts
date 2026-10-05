import { expect, it, vi } from 'vitest'
import { useFleetStore } from '../src/stores/fleet'

it('shares one clock and stops after the last subscriber leaves', () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const fleet = useFleetStore()
  const first = fleet.subscribe()
  const second = fleet.subscribe()
  expect(vi.getTimerCount()).toBe(1)
  const start = fleet.now
  vi.advanceTimersByTime(2000)
  expect(fleet.now).toBe(start + 2000)
  first()
  first()
  expect(vi.getTimerCount()).toBe(1)
  second()
  expect(vi.getTimerCount()).toBe(0)
})

it('pauses in a hidden tab and catches up on returning', () => {
  vi.useFakeTimers()
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const fleet = useFleetStore()
  const release = fleet.subscribe()
  const start = fleet.now
  visibility.mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
  vi.advanceTimersByTime(20_000)
  expect(fleet.now).toBe(start)
  expect(vi.getTimerCount()).toBe(0)
  visibility.mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  expect(fleet.now).toBe(start + 20_000)
  expect(vi.getTimerCount()).toBe(1)
  release()
})

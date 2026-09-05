import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { getActivePinia } from 'pinia'
import { i18n } from '../src/i18n'
import { useUiStore } from '../src/stores/ui'
import AppSidebar from '../src/components/layout/AppSidebar.vue'

it('makes a closed mobile drawer inert, moves focus on open and restores it on Escape', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/')
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  const wrapper = mount(AppSidebar, { attachTo: document.body, global: { plugins: [getActivePinia()!, router, i18n] } })
  const ui = useUiStore()
  expect(wrapper.get('aside').attributes('inert')).toBeDefined()
  ui.toggleSidebar()
  await nextTick()
  await nextTick()
  expect(wrapper.get('aside').attributes('inert')).toBeUndefined()
  expect(wrapper.get('aside').attributes('aria-modal')).toBe('true')
  expect(document.activeElement).toBe(wrapper.get('.sidebar__close').element)
  await wrapper.get('aside').trigger('keydown', { key: 'Escape' })
  await nextTick()
  expect(ui.sidebarOpen).toBe(false)
  expect(document.activeElement).toBe(trigger)
  expect(document.body.classList.contains('is-locked')).toBe(false)
  wrapper.unmount()
})

it('releases the scroll lock when resizing an open drawer to desktop', () => {
  let change = () => {}
  const query = { matches: true, addEventListener: (_: string, fn: () => void) => { change = fn }, removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', vi.fn(() => query))
  const ui = useUiStore()
  ui.toggleSidebar()
  expect(document.body.classList.contains('is-locked')).toBe(true)
  query.matches = false
  change()
  expect(ui.isMobile).toBe(false)
  expect(ui.sidebarOpen).toBe(false)
  expect(document.body.classList.contains('is-locked')).toBe(false)
})

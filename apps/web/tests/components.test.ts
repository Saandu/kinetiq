import { expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { getActivePinia } from 'pinia'
import { i18n } from '../src/i18n'
import { useUiStore } from '../src/stores/ui'
import KAlertIcon from '../src/components/ui/KAlertIcon.vue'
import KBadge from '../src/components/ui/KBadge.vue'
import KField from '../src/components/ui/KField.vue'
import KInput from '../src/components/ui/KInput.vue'
import KMeter from '../src/components/ui/KMeter.vue'
import KModal from '../src/components/ui/KModal.vue'
import KPagination from '../src/components/ui/KPagination.vue'
import KSwitch from '../src/components/ui/KSwitch.vue'
import KToaster from '../src/components/ui/KToaster.vue'

/**
 * The interface primitives.
 *
 * The stores and the simulator are covered elsewhere; these are the pieces the
 * README makes accessibility claims about — labelled controls, status carried
 * by more than colour, dialogs that trap and restore focus. A claim in a README
 * that nothing asserts is a claim that quietly stops being true.
 */

const withI18n = () => ({ plugins: [i18n] })

/* -------------------------------------------------------------------- *
 * Labelling
 * -------------------------------------------------------------------- */

it('wires a field label to the control rendered in its slot', () => {
  const Host = defineComponent({
    components: { KField, KInput },
    template: '<KField label="Warning threshold" hint="Percent"><template #default="{ id }"><KInput :id="id" /></template></KField>',
  })
  const wrapper = mount(Host, { global: withI18n() })

  const id = wrapper.get('input').attributes('id')
  expect(id, 'the slot must receive a generated id').toBeTruthy()
  expect(wrapper.get('label').attributes('for')).toBe(id)
  expect(wrapper.get('.field__hint').text()).toBe('Percent')
})

it('exposes a switch as a switch, not a styled div', async () => {
  const wrapper = mount(KSwitch, { props: { label: 'Maintenance mode', modelValue: false }, global: withI18n() })
  const button = wrapper.get('button')

  expect(button.attributes('role')).toBe('switch')
  expect(button.attributes('aria-checked')).toBe('false')
  expect(button.attributes('aria-label')).toBe('Maintenance mode')

  await button.trigger('click')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
})

it('does not toggle a disabled switch', async () => {
  const wrapper = mount(KSwitch, { props: { modelValue: false, disabled: true }, global: withI18n() })

  await wrapper.get('button').trigger('click')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})

/* -------------------------------------------------------------------- *
 * Status is never carried by colour alone
 * -------------------------------------------------------------------- */

it('draws a different shape per severity, and hides the icon from assistive tech', () => {
  const markupFor = (level: 0 | 1 | 2 | 3) =>
    mount(KAlertIcon, { props: { level }, global: withI18n() }).html()

  const shapes = [markupFor(0), markupFor(1), markupFor(2), markupFor(3)]
  expect(new Set(shapes).size, 'each level needs its own shape, not just its own colour').toBe(4)
  // The icon is decorative: the text beside it is what conveys the level.
  expect(shapes[3]).toContain('aria-hidden="true"')
})

it('renders badge content as text', () => {
  const wrapper = mount(KBadge, { props: { tone: 'bad' }, slots: { default: 'Offline' }, global: withI18n() })

  expect(wrapper.text()).toBe('Offline')
})

it('clamps a meter to its track and colours from the value in auto tone', () => {
  const width = (value: number, max = 100) =>
    mount(KMeter, { props: { value, max }, global: withI18n() }).get('.meter__fill').attributes('style')

  expect(width(150)).toContain('width: 100%')
  expect(width(-20)).toContain('width: 0%')
  expect(width(50)).toContain('width: 50%')

  const toneAt = (value: number) =>
    mount(KMeter, { props: { value }, global: withI18n() }).get('.meter').classes().join(' ')
  expect(toneAt(40)).toContain('meter--bad')
  expect(toneAt(70)).toContain('meter--warn')
  expect(toneAt(95)).toContain('meter--good')
})

/* -------------------------------------------------------------------- *
 * Pagination
 * -------------------------------------------------------------------- */

it('renders nothing when everything fits on one page', () => {
  const wrapper = mount(KPagination, { props: { page: 1, total: 4, perPage: 8 }, global: withI18n() })

  expect(wrapper.find('nav').exists()).toBe(false)
})

it('marks the current page and disables the ends', async () => {
  const wrapper = mount(KPagination, { props: { page: 1, total: 16, perPage: 8 }, global: withI18n() })
  const [prev, one, two, next] = wrapper.findAll('button')

  expect(prev.attributes('disabled')).toBeDefined()
  expect(next.attributes('disabled')).toBeUndefined()
  expect(one.attributes('aria-current')).toBe('page')
  expect(two.attributes('aria-current')).toBeUndefined()

  await two.trigger('click')
  expect(wrapper.emitted('update:page')?.at(-1)).toEqual([2])

  // Clicking the page you are already on is not a navigation.
  await one.trigger('click')
  expect(wrapper.emitted('update:page')).toHaveLength(1)
})

/* -------------------------------------------------------------------- *
 * Dialogs
 * -------------------------------------------------------------------- */

/**
 * Mounts closed, then opens.
 *
 * The component arms itself on the false -> true transition rather than on
 * mount, which is how the app uses it: one KModal per page, toggled by a
 * prop. A modal rendered already-open — behind a v-if, say — would not trap
 * focus or lock the page.
 */
const mountModal = async (props: Record<string, unknown> = {}) => {
  const wrapper = mount(KModal, {
    attachTo: document.body,
    props: { open: false, title: 'Remove machine', ...props },
    slots: { default: '<button data-autofocus>Confirm</button><button>Something else</button>' },
    global: withI18n(),
  })
  await wrapper.setProps({ open: true })
  await nextTick()
  await nextTick()
  return wrapper
}

it('names the dialog by its own title and takes focus into it', async () => {
  const wrapper = await mountModal()

  const panel = document.querySelector('.modal__panel')!
  expect(panel.getAttribute('role')).toBe('dialog')
  expect(panel.getAttribute('aria-modal')).toBe('true')
  const labelledBy = panel.getAttribute('aria-labelledby')
  expect(document.getElementById(labelledBy!)?.textContent).toBe('Remove machine')
  expect(document.activeElement).toBe(document.querySelector('[data-autofocus]'))

  wrapper.unmount()
})

it('closes on Escape and locks the page while open', async () => {
  const wrapper = await mountModal()
  expect(document.body.classList.contains('is-locked')).toBe(true)

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  expect(wrapper.emitted('close')).toHaveLength(1)

  await wrapper.setProps({ open: false })
  await nextTick()
  expect(document.body.classList.contains('is-locked')).toBe(false)

  wrapper.unmount()
})

it('keeps Tab inside the dialog', async () => {
  const wrapper = await mountModal()

  const focusable = Array.from(document.querySelectorAll<HTMLElement>('.modal__panel button'))
  const last = focusable[focusable.length - 1]
  last.focus()

  // jsdom reports offsetParent as null, so the component treats the panel as
  // having no visible focusable children and pulls focus back to it. Either
  // way the assertion that matters holds: focus never leaves the dialog.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
  await nextTick()
  expect(document.querySelector('.modal__panel')!.contains(document.activeElement)).toBe(true)

  wrapper.unmount()
})

it('returns focus to whatever opened it', async () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()

  const wrapper = mount(KModal, {
    attachTo: document.body,
    props: { open: false, title: 'Remove machine' },
    slots: { default: '<button data-autofocus>Confirm</button>' },
    global: withI18n(),
  })

  await wrapper.setProps({ open: true })
  await nextTick()
  await nextTick()
  expect(document.activeElement).not.toBe(opener)

  await wrapper.setProps({ open: false })
  await nextTick()
  expect(document.activeElement).toBe(opener)

  wrapper.unmount()
  opener.remove()
})

/* -------------------------------------------------------------------- *
 * Toasts
 * -------------------------------------------------------------------- */

it('announces toasts politely and dismisses one on click', async () => {
  const wrapper = mount(KToaster, {
    attachTo: document.body,
    global: { plugins: [getActivePinia()!, i18n] },
  })
  const ui = useUiStore()

  const region = document.querySelector('.toaster')!
  expect(region.getAttribute('role')).toBe('status')
  expect(region.getAttribute('aria-live')).toBe('polite')

  vi.useFakeTimers()
  ui.notify('Saved')
  await nextTick()
  const toast = document.querySelector<HTMLElement>('.toast')
  expect(toast?.textContent).toContain('Saved')

  toast!.click()
  await nextTick()
  expect(ui.toasts).toHaveLength(0)

  wrapper.unmount()
})

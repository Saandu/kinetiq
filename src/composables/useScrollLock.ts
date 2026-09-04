/**
 * Page scroll lock for overlays (modal, mobile sidebar).
 *
 * `overflow: hidden` on <body> is not enough on iOS -- Safari keeps scrolling
 * the page behind the overlay, and taking the body out of flow to stop it
 * throws away the scroll position, so dismissing the overlay dumps the user at
 * the top of a long dashboard. Stashing scrollY and restoring it on release is
 * what makes the lock survive.
 *
 * Reference-counted, because a modal can be opened while the mobile sidebar is
 * already holding a lock.
 */

let depth = 0
let savedY = 0

export function lockScroll(): void {
  depth++
  if (depth > 1) return

  savedY = window.scrollY
  document.body.style.top = `-${savedY}px`
  document.body.classList.add('is-locked')
}

export function unlockScroll(): void {
  if (depth === 0) return
  depth--
  if (depth > 0) return

  document.body.classList.remove('is-locked')
  document.body.style.top = ''
  window.scrollTo(0, savedY)
}

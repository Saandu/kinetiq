# Browser verification

Run `npm run verify`, then `npm run preview`. Exercise the built app in a current
desktop browser and on a phone before publishing a change. CI checks behavior
in jsdom; it cannot prove layout, native focus behavior or mobile Safari support.

## Core flows

- Open the dashboard and both pagination pages. Inspect an online machine and
  the offline conveyor; navigate directly to a machine URL and refresh it.
- Open a nonexistent machine URL, including its settings/notifications routes.
  Expect a recovery screen, not fictional telemetry for the unknown machine.
- Edit a state name and alert thresholds together. Save only the state panel,
  reload, and confirm the thresholds did not change. Repeat in reverse.
- Save valid thresholds on the cooling pump and check the dashboard severity.
  Empty, unordered or out-of-range thresholds must not be accepted.
- Record maintenance in the past; try missing fields and a future time.
- Remove a machine and dismiss a notification through their confirmation dialogs.
  Reload to verify persistence. Reset the demo from Settings and confirm the
  dashboard returns with all eight machines.

## Keyboard, mobile and presentation

- Tab to the skip link and activate it. Confirm focus reaches the main content.
- At 390px width, confirm no horizontal layout overflow. Closed navigation must
  not appear in the accessibility tree or keyboard tab order.
- Open navigation. Focus should enter the drawer; Tab/Shift+Tab should stay
  inside it. Escape and the close button should restore focus to the opener.
- Open the drawer and resize beyond 900px. The page should scroll normally.
- Test modal Tab/Shift+Tab, Escape, focus return and scroll restoration.
- Inspect dark/light themes, English/German, reduced motion and 200% zoom.
- Check the browser console and refresh deep links on the deployed host.

## Review scope

The app is a local simulation. Passing these checks does not validate industrial
safety, backend authorization, real-time delivery or machine-learning accuracy.
Those capabilities belong to a different system, not this public repository.

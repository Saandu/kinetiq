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

The hosted app uses browser-local simulation. The Compose app uses fictional
sensor values transported through actual MQTT, SQS, PostgreSQL and HTTP services.
Backend integration tests cover local tenant isolation and delivery/recovery paths.
These checks do not establish industrial safety, cloud authentication, prediction
accuracy or production-scale performance.

## Compose acceptance

Run `npm run local:up`, then `npm run local:verify`. Open port 3101 rather than the
browser-only development port 3100. Check both fleet pages, latest sensor values,
missing analytics, disabled writes, settings/notification deep links and mobile
navigation. Stop/start using `docker compose down` and `docker compose up -d --wait`;
stored readings must remain available. Do not remove volumes during this check.

The committed CI gate runs the same local acceptance script on trusted main pushes.
Local checks do not imply the unpushed workflow has succeeded on GitHub.

## Helm chart checks

After `npm run k8s:tools`, run `npm run helm:verify` and `npm run helm:smoke`.
These checks do not require a running cluster. They lint/render the local and CI
values, validate strict pinned Kubernetes 1.36.5 schemas without skipping missing
schemas, enforce application security/network/memory constraints, reject unsafe
changes and check the mounted Nginx configuration in its actual image.
Run `npm run k8s:app:verify` against the configured local cluster to require
fresh readings from all twelve devices, API/database metric agreement, encrypted
service connections, deep links and rejected writes. `k8s:boundaries:verify`
exercises real MQTT authentication/ACL and network denial. `k8s:scaling:config`
checks local scaling bounds and seven unsafe changes without cluster access;
`k8s:scaling:verify` runs the bounded 200-message backlog and recovery drill.
The separate `k8s:database:verify` drill verifies fresh-volume S3 recovery.
See [the pipeline lesson](lessons/PHASE_1_PIPELINE_SCALING.md) for prerequisites,
cleanup and the distinction between capacity measurements and this controlled test.

`npm run k8s:gitops:config` validates both GitOps chart profiles against strict
Kubernetes schemas, checks self-contained PreSync hooks, bounded ownership and
the KEDA replica exclusion. `npm run k8s:gitops:verify` checks the reconciled Git
SHA, successful hooks, live drift repair and fresh pipeline data. Static checks
run on PRs without secrets; the disposable cluster/recovery job runs on trusted
repository pushes or an explicit maintainer dispatch. Its result must be verified on
GitHub before claiming the remote Kubernetes CI gate has passed.

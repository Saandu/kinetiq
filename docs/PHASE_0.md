# Phase 0: local production foundations

The complete production plan remains in force. This file records implementation order and verified progress, rather than replacing or reducing its scope.

## Commit sequence

1. Commit the revised plan and learning guide; record supported release baselines.
2. Move the Vue app to `apps/web`, add npm workspaces and one root lockfile, update Firebase/CI/source links, and verify the unchanged frontend.
3. Update frontend packages to their current stable releases, matching Node 24 types. Resolve compiler/configuration changes and rerun verification.
4. Make every TelemetrySource method asynchronous. Stores own resolved state, loading, errors, stale-response protection and mutation completion. Pages show failures and only confirm successful writes. Preserve the shared visibility-aware polling lifecycle and accessibility behavior.
5. Add `packages/contracts`: bounded, versioned telemetry batches, runtime validation, generated JSON Schema and contract fixtures.
6. Add `packages/db`: Drizzle schema, SQL migrations, seed data, dedicated service roles, transaction-local tenant context, idempotent inserts, daily partitions and retention. Test against PostgreSQL 18 with Testcontainers, including extensions, isolation, missing tenant context and pooled connections.
7. Add simulator, local MQTT-to-SQS bridge, ingest and API with read routes. Verify malformed batches, duplicate delivery, retries and persistence before deleting queue messages.
8. Add service Dockerfiles, extension-capable database image, Compose, health checks, graceful shutdown and local configuration. Verify the dashboard reads rows through the API. Keep the hosted demo on the local browser adapter until Phase 2.

Run applicable checks before each commit. Python, Helm and CDK checks become applicable when those projects exist. Database integration and image checks require a working Docker engine and cannot be replaced by mocks.

## What to try

After the workspace move, run from the repository root:

```sh
npm ci
npm run verify
npm run dev
```

Open http://localhost:3100. Check the dashboard, a machine deep link, settings and the mobile drawer. The production build is `apps/web/dist`, the same artifact Firebase uses.

## Questions to explain in an interview

- Why does a workspace use one lockfile rather than a separate installation per service?
- Why do asynchronous results live in the store rather than inside Vue computed getters?
- What happens if a slow response for one machine arrives after the user selects another?
- Why must the UI wait for a successful write before showing a success notification?

## Environment at the start

Node 24.21.0 was downloaded into the ignored `.tools` directory and verified against the official SHA-256 checksum list for local checks. This does not replace the system-wide Node installation; `.nvmrc` selects the required release for developers and CI.

Docker is not installed on this Windows host. Database integration, image builds and the Compose acceptance check remain pending until a Docker engine is available. No cloud resources are required for Phase 0.

## Verified progress, 5 October 2026

- Plan and guide committed; full scope preserved.
- Workspace move: 34 existing tests passed and all 19 built files were byte-identical to the pre-move output.
- Dependencies: Node 24.21.0 used for checks; current frontend stable releases pinned; TypeScript 7.0.2 enabled for shared packages; the maintained TypeScript 6 API shim preserves Vue and ESLint compatibility. Full npm audit reported zero vulnerabilities.
- Async data seam: 42 tests passed; Vue type checks and Vite build passed. Browser smoke checks covered dashboard, machine selection, maintenance toggle/reload, settings save/reload, 390px overflow and mobile Escape close. Browser console had no warnings/errors. Local QA changes were reset.
- The hosted demo remains on its local source. These commits have not been pushed or deployed.

Telemetry contracts now include strict Zod validation, shared fixture cases and a generated JSON Schema checked during builds. Native TypeScript 7 checks source and tests. A fresh `npm ci` followed by `npm run verify` passed: 42 frontend tests and 30 contract tests, lint, both compiler checks and both builds. Python parity remains pending until analytics exists.

Next: real PostgreSQL integration and containers. Phase 0 is not complete until the Compose acceptance check passes against real dependencies.

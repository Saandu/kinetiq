# Telemetry contracts

The v1 batch matches the production plan: a device publishes up to six readings per message. Zod validates strict objects, finite metrics, a safe sequence integer, states 0–7 and UTC timestamps with millisecond precision. Negative vibration, speed and power are rejected; machine-specific upper bounds belong to device configuration. The tenant comes from trusted device identity, never the payload.

`parseTelemetryMessage` additionally bounds the original UTF-8 body to 5 KiB before parsing, including whitespace, and enforces strictly increasing reading timestamps. It does not enforce sequence monotonicity across deliveries: SQS can duplicate or reorder messages, so the ingest/database layer owns idempotency. Device identity must also be matched against the trusted envelope by ingest.

`schema/telemetry-batch.v1.schema.json` is generated from the structural Zod schema. JSON Schema cannot express ordering between timestamps or a transport byte limit. Python validation must enforce those two rules separately and pass the same fixture cases when analytics is added; that parity check is still pending.

The package uses TypeScript 7's native `tsc`. Vue template checking and ESLint use Microsoft's maintained TypeScript 6 compatibility API; neither changes this package's compiler.

Run from the repository root:

```sh
npm run typecheck --workspace @kinetiq/contracts
npm run test --workspace @kinetiq/contracts
npm run schema:generate --workspace @kinetiq/contracts
npm run verify
```

The build checks that the committed generated schema is current. Changes to the wire contract require an explicit versioning decision and fixtures, rather than silently widening acceptance.

# Phase 0 lesson: the database foundation

This lesson covers the foundation implemented on 5 October 2026. The dashboard still uses its browser simulator. The new database package is exercised by real PostgreSQL integration tests; the queue, ingest service and HTTP API have not been connected yet.

## 1. An image is a recipe; a container is an instance

`infra/docker/postgres/Dockerfile` starts from PostgreSQL 18.6 and installs two pinned extensions. `pg_partman` manages partitions; `pg_cron` runs scheduled SQL. Docker builds this into the `kinetiq-postgres:18.6-1` image. Testcontainers starts a disposable container from it, gives it temporary credentials and removes it after the tests.

An extension being present on disk does not mean it is active in a database. Our migrations run `CREATE EXTENSION`, and tests query installed extension versions. pg_cron also needs a server startup setting so its background worker is loaded.

## 2. The schema describes tables; migrations change a database

The Drizzle schema defines tables and gives TypeScript typed query access. Drizzle Kit generated the base SQL. We reviewed it and added PostgreSQL features such as range partitioning, policies and service grants.

A migration is a versioned instruction, not a script we freely edit after deployment. Our runner applies migrations in order and stores a checksum of each file. Re-running the same migrations does nothing. Editing an applied migration fails. A failed migration rolls back its changes and its success record.

An advisory lock makes two simultaneous migration processes wait for one another. Without it, both could decide a migration has not run and try to create the same tables.

Later, an Argo CD PreSync migration must remain compatible with the old application pods still running. That is the expand/contract rule: add the new shape, switch callers, and remove the old shape in a later release.

## 3. A transaction groups statements into one outcome

Suppose a batch contains two readings. The first insert works, but the second has no matching partition. Keeping only the first would leave a partially processed queue message.

Our insert happens inside a transaction:

```text
BEGIN
  Set local tenant context
  Validate the device mapping
  Insert readings
  Advance last_seen_at
  Queue a notification
COMMIT
```

If any statement fails, `ROLLBACK` removes all changes. PostgreSQL sends the notification only after commit. The future queue consumer must acknowledge/delete the message only after the database function succeeds.

## 4. RLS protects rows; roles restrict operations

An organization is a tenant. Every tenant-owned row carries an organization ID. Row-level security (RLS) restricts which rows a database login can see or change, even if a developer forgets a query's organization filter.

Roles answer a different question: what operations may this service perform? Ingest can insert telemetry, read conflict keys and update a device's last-seen timestamp. It cannot read sensor values or delete telemetry. Analytics can write health and predictions but cannot edit model settings. API and alerts have their own grants.

RLS is forced for non-superuser table owners too. Superusers still bypass it, which is why services must never use migration credentials.

**Limitation:** a trusted backend login can set the tenant context. RLS does not authenticate a person or a device. The API/ingest layer must derive identity from verified authentication rather than accept an organization ID supplied by a caller.

## 5. A pooled connection must forget the previous request

A pool reuses database connections instead of opening a new one for every request. This makes a session-level tenant setting dangerous: the next request might inherit it.

`withTenantTransaction` uses `set_config('app.organization_id', organizationId, true)`. The final `true` makes the setting local to the transaction. It disappears after either commit or rollback. Missing tenant context returns no rows.

Our test checks the PostgreSQL process ID before and after a transaction. That proves the connection was actually reused and still lost its previous context.

## 6. Foreign keys protect relationships across tenants

A normal foreign key can prove that a machine exists. A composite foreign key on `(machine_id, organization_id)` additionally proves that the machine belongs to the same organization as the new row.

Without this, a row could claim tenant A while referring to tenant B's machine. We apply the same principle to sites, users and alerts, and test a deliberately forged relationship.

## 7. Idempotency makes redelivery safe

SQS may deliver a message more than once. Each telemetry reading has a unique `(machine_id, ts)` key. `ON CONFLICT DO NOTHING` keeps a duplicate reading from becoming a second row.

We do not reject a batch merely because its sequence number is older: valid batches can arrive out of order. `last_seen_at` uses the greatest timestamp so an older delivery cannot move it backwards.

Open alerts have a separate partial unique index. It deduplicates a condition while its alert is open; after resolution, that condition may open a new alert.

## 8. Partitions divide a large logical table

The application inserts into `telemetry`, but PostgreSQL places each row in the daily child table matching its timestamp. The logical table stays convenient to query while old daily partitions can be removed efficiently.

pg_partman creates partitions ahead of time and drops expired ones. The test inserts an old reading into an expired partition, runs maintenance and checks that the partition is gone. Health uses monthly partitions.

**Limitations:** daily partition expiry is not an exact row-by-row 30-day cutoff. Also, our local image has not yet been validated with CloudNativePG. That compatibility work belongs to Phase 1.

## Practice

With the required Node version and Docker on PATH, run from the repository root:

```sh
npm run db:image
npm run build --workspace @kinetiq/contracts
npm run test --workspace @kinetiq/db
```

Read `packages/db/src/index.ts` beside the transaction and ingest tests. Then explain:

- Why must queue acknowledgement happen after commit?
- What is the difference between a role grant and an RLS policy?
- Why does transaction-local tenant context matter with pooling?
- What does a composite foreign key prevent that a single-column key does not?
- Why do we deduplicate readings by machine/timestamp instead of rejecting every older sequence?
- Why is an integration test with a real service login stronger evidence than a mocked database test?

The next implementation connects simulator, broker, queue, ingest and read API. Hourly aggregate computation, full Compose acceptance, cloud TLS and backup recovery are still pending; these tests do not claim those features are delivered.

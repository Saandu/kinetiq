# Phase 1: the live Kubernetes pipeline and bounded scaling

This lesson accompanies the 10 October 2026 local implementation. The production
plan keeps its full scope. Cloud identity, analytics, alerts and public backend
deployment are later work; this checkpoint makes the existing read-only pipeline
run under Kubernetes.

## What you can see

Open **http://127.0.0.1:3102**, then a machine's Details page. It displays the latest
stored sensor timestamp, temperature, vibration, spindle speed and power. Twelve
fictional devices publish one batch per minute, containing six readings ten seconds
apart. The browser polls every two seconds. A new timestamp and changing values
therefore normally arrive once per minute; this is not a ten-second browser animation.

The banner identifies the local backend. Unimplemented anomaly scores and confidence
remain unavailable. The Firebase public demo continues using browser simulation.
These are separate evidence scopes, and none contains private client backend code.

Port 3101 belongs to Compose. Port 3102 belongs to Kubernetes ingress. We stopped
Compose to avoid running two databases and emulator stacks on your 16 GB laptop.
The Docker/WSL memory allocation was not increased.

## Follow one reading

```text
simulator → authenticated MQTT broker → bridge → emulated SQS
                                                 ↓
browser ← Nginx/Traefik ← API ← PostgreSQL ← ingest worker
```

The simulator creates fictional sensor data. MQTT is the device-facing transport.
Mosquitto authenticates the device username and checks its permitted topic. The
bridge subscribes to those topics and transfers a validated message to SQS. An
ingest worker receives the message, resolves the registered device, starts a tenant
transaction and inserts the readings. It acknowledges SQS only after commit.

The API reads committed rows. Nginx serves the Vue application and proxies `/v1/`
to the API; Traefik routes the laptop's loopback port into Nginx. Keeping the browser
and API on the same origin avoids adding a separate local CORS/authentication flow.

SQS may redeliver. MQTT can also redeliver after a reconnect. The database's unique
reading identity prevents duplicates. Adding workers does not make delivery exactly
once; idempotent database writes make repeated delivery safe.

## What we added, and why

`scripts/setup-k8s-messaging.mjs` provisions the local broker, generated credentials,
device ACLs, a Service, a persistent volume and its NetworkPolicy. Credentials live
in ignored `.tools/k8s/secrets/mqtt.json` and are sent to Kubernetes through stdin.
Missing local credentials with existing cluster identities cause a refusal rather
than silent password replacement. Never print or commit those files.

The twelve devices share a **local simulator password**, but each username can
publish only its exact site/device topic. This is not production per-device
certificate authentication. AWS IoT identity and its failure cases remain Phase 2.
The bridge has read permissions. Its fixed client ID and the simulator's device IDs
require Recreate updates to avoid two overlapping clients disconnecting each other.

The broker runs as UID/GID 1883 with a read-only root filesystem and no Linux
capabilities. Its startup script builds password and ACL files in writable `/tmp`.
Broker persistence uses a separate PVC. Readiness checks whether its listener is
open; the boundary tests separately prove authentication and ACL enforcement.

`scripts/setup-k8s-app.mjs` prepares the database and broker, upgrades the Helm
release, waits for the **current release's** migration and queue Jobs, waits for
the five Deployments and runs acceptance. Waiting for an old completed Job would
not prove the new release initialized correctly. The release revision identifies
the two setup Jobs precisely.

Queue setup is repeatable. Hobby LocalStack does not provide the durable S3/SQS
host-recovery guarantee we need in production. After an emulator restart, recreate
queues through `k8s:app` and take a fresh backup before a restore drill. An old
completed Backup resource does not establish that its S3 objects still exist.

These migration Jobs currently run alongside application rollout. They must use
backward-compatible expand/contract migrations, because existing application Pods
can remain active while a migration runs. Ordered Argo CD reconciliation is the
next checkpoint; no GitOps deployment is claimed here.

## Encrypted database connections

CloudNativePG already rejected plaintext connections. We mounted **only `ca.crt`**
from its CA Secret into API, ingest and migration Pods. We did not mount the CA's
private signing key. `DATABASE_CA_FILE` points to that mounted certificate.

`databaseTls()` in `packages/runtime/src/index.ts` passes the CA and
`rejectUnauthorized: true` to node-postgres. This encrypts the connection and
checks the certificate's issuer and hostname. The helper rejects URL SSL settings
that could override this verification; a missing configured CA fails rather than
falling back to plaintext.

The app connects through the stable `postgres` Service alias. CloudNativePG's
certificate now includes that alias and its full namespace-qualified names. A
certificate valid only for `kinetiq-db-rw` would not verify a connection to
`postgres`, even though both resolve to the same database.

Compose does not set this CA variable and keeps its existing isolated local
configuration. Cloud deployment will require its own verified TLS and identity
configuration, not a copied emulator setup.

## The proxy problem we found

The first full-stack acceptance returned HTTP 502 despite healthy Pods. Nginx's
dynamic resolver queried the short name `api` and received a DNS failure. Its
resolver does not apply the Pod's DNS search list in the way the application's
normal DNS lookup does.

The chart now renders `api.<namespace>.svc.cluster.local`. Nginx discovers the
cluster DNS address from `/etc/resolv.conf` and resolves the full API name. The
regression gate rejects the old short-name configuration. An Nginx syntax smoke
test alone could not find this: it requires the running Kubernetes request path.

The local ingress also accepts the host used by `127.0.0.1:3102`, alongside
`kinetiq.localhost`. The k3d port remains loopback-only, and the chart supports
local/CI profiles. This is not a production public catch-all ingress design.

## What autoscaling does

KEDA supplies SQS backlog metrics to Kubernetes' Horizontal Pod Autoscaler (HPA).
The ScaledObject targets the ingest Deployment, keeps a minimum of one worker,
caps it at three and targets twenty queued/in-flight messages per worker. KEDA
polls every five seconds; HPA reconciliation and Pod startup add their own delay.
Scaling is not instantaneous, and the three-worker ceiling still applies to a
much larger backlog.

The local scaler uses explicit fake AWS credentials and an explicit LocalStack
endpoint. Its Kubernetes network boundary permits local SQS, DNS, the Kubernetes
API and internal KEDA communication. It does not allow arbitrary Internet egress.
KEDA's operator needs Kubernetes API permissions; application Pods still do not
receive service-account API tokens.

The application uses LocalStack's dynamic queue URL. KEDA's parser expects the
standard account/name path, so its metadata uses the emulator's supported standard
URL form for the same queue. Both were exercised against the running emulator.
See the [pinned upstream scaler implementation](https://raw.githubusercontent.com/kedacore/keda/v2.21.0/pkg/scalers/aws_sqs_queue_scaler.go)
for URL parsing, endpoint override and inclusion of in-flight messages.

Normal traffic is twelve batches per minute and is comfortably handled by one
worker. **The bounded test, rather than normal dashboard traffic, demonstrates
scale-out.** This is not a throughput benchmark or production capacity claim.

## The controlled backlog experiment

`k8s:scaling:verify` creates two short-lived restricted Jobs. One holds a transaction
row lock on the CNC device record for seventy seconds. Ingest needs to update that
device's monotonic `last_seen_at` after inserting telemetry, so its transaction
waits or retries. Ordinary API reads continue to work under PostgreSQL MVCC; we
did not lock the whole telemetry table or stop the database.

The second Job sends exactly 200 valid messages, at no more than twenty messages
per second. Their timestamps are one hour old, with fractional milliseconds that
avoid the simulator's ten-second timestamps. The normal simulator's rate cap is
unchanged. This is a deliberately slower-database experiment, not an unrestricted
traffic generator or an artificially delayed production handler.

The test observes three ready workers, checks that the API remains readable, waits
for the lock to release, checks all 200 unique readings committed, and waits for
one ready worker again. Existing query deadlines can cause retries during the
lock; SQS visibility and idempotency make those retries safe. In-flight messages
remain part of the scaling signal while work is outstanding.

After successful verification it removes only its own 200 fixture rows, so they
do not distort dashboard state shares. Jobs and their temporary ConfigMap are
deleted in `finally`; deleting a lock Pod closes its database connection and
releases the transaction. A failed drill's outstanding queue messages may still
need diagnosis before another run. Never purge the queue to hide a failing test.

## Memory and connection budgets

The Helm gate reserves three ingest workers even when one currently runs. Maximum
application limits, all rolling surges and both setup Jobs total **2,304 MiB locally**
and **2,560 MiB in CI**. These exclude platform resources and Kubernetes. KEDA adds
three 192 MiB limits, for 576 MiB. Configured limits are ceilings, not measured RAM.

The scaler setup checks this application budget before enabling scale-out. It
also checks API/worker pool totals, one API/worker surge and fifteen reserved
maintenance connections against PostgreSQL's fifty-connection cap. API pools use
five connections each; ingest pools use three. Extra workers otherwise risk
exhausting the database while trying to help it.

Use `docker stats` and Kubernetes Pod metrics to inspect actual use. Keep Compose
stopped while Kubernetes runs. This local single-node stack has no database or
server high availability, regardless of how many workers it runs.

## Commands and useful evidence

Run commands from `D:\DOCS\Desktop\kinetiq`. After building/importing current images:

```powershell
npm run k8s:up
npm run k8s:images
npm run k8s:app
npm run k8s:scaling
npm run k8s:boundaries:verify
npm run k8s:scaling:verify
npm run k8s:app:verify
```

Operator installation remains a prerequisite on a fresh cluster (`k8s:operators`).
`k8s:app` recreates ordinary setup Jobs on each Helm revision. Images use the local
tag with pull policy Never; rebuild and import changed images before rolling them
out. `k8s:app` explicitly restarts the Deployments after setup, because reusing a
local image tag alone does not change a Pod template or replace its running image.
GitOps image promotion and CI cluster installation are the next step.

```powershell
npm run k8s:kubectl -- get pods -n kinetiq-local
npm run k8s:kubectl -- get hpa -n kinetiq-local
npm run k8s:kubectl -- logs deployment/kinetiq-ingest -n kinetiq-local --tail=20
npm run k8s:kubectl -- top pods -A
```

Acceptance requires **new readings during the test** from all twelve devices,
compares each API metric object to its committed database row, verifies live API
and ingest connections use TLS, checks a Vue deep link and rejects a write request.
The CA/hostname negative checks from the database recovery checkpoint remain
separate evidence; `pg_stat_ssl` alone proves encryption, not hostname validation.

Boundary Jobs prove wrong MQTT credentials and cross-device publishing fail; a
bridge network identity cannot reach API/PostgreSQL; an untrusted application Pod
cannot reach API/PostgreSQL/MQTT/SQS. DNS failure is treated as a test failure,
rather than mistaken for successful network isolation.

## Practise explaining it

1. Open CNC Details, note the sensor timestamp and values, then wait one minute.
   Explain why browser polling can be faster than arriving telemetry.
2. Watch `get hpa` in a second terminal during the bounded drill. Distinguish
   desired replicas, running Pods and ready Pods.
3. Explain why the API stayed readable while one device row was locked. Why would
   an exclusive lock on the entire telemetry table have been a worse experiment?
4. Explain why SQS acknowledgement must happen after database commit. What makes
   redelivery safe if acknowledgement fails?
5. Explain why adding three workers requires both a memory budget and a connection
   budget. What happens if the producer permanently exceeds maximum capacity?
6. Diagnose HTTP 502 with healthy Pods: check Nginx logs, DNS name, Service endpoints,
   API readiness and NetworkPolicies. Why did the static smoke test miss our bug?

Next: ordered Argo CD reconciliation and disposable Kubernetes CI checks. Only
after those gates pass do we call Phase 1 complete.

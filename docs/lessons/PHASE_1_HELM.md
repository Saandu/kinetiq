# Phase 1: packaging Kinetiq with Helm

## What we built and what it proves

The chart in `infra/helm/kinetiq` describes the five existing application services:
API, ingest, local bridge, simulator and web. It also describes migration and
queue setup Jobs, configuration, internal Services, ingress and NetworkPolicies.
It reuses the current images and their local-readonly contracts.

This checkpoint renders and validates the chart. It does not run the complete
application in Kubernetes. CloudNativePG, its database, local MQTT, LocalStack
and existing Secrets must be provisioned in the following steps. We have not
proved Pod readiness, policy enforcement, backups or full-stack RAM usage here.
The hosted Firebase demo still uses browser-local simulation.

## From Compose to Kubernetes objects

A **Deployment** describes the desired number of Pods and how to replace them.
A **Pod** contains the running container, mounted files and security settings.
A **Service** gives selected Pods a stable internal name even when their IPs
change. Labels connect a Service to the right Pods; our checks compare those
selectors to catch a service that accidentally routes to the wrong workload.

An **Ingress** routes HTTP traffic from Traefik to the web Service. Nginx serves
the Vue files and proxies `/v1/` to the internal API, keeping the browser's calls
on the same origin. Local ingress uses `kinetiq.localhost` on loopback port 3102;
HTTPS and cloud authentication come later.

Compose supplies dependency names such as `api`, `postgres`, `localstack` and
`mosquitto`. Current services explicitly reject unexpected remote endpoints.
The chart preserves those names in a dedicated namespace. `postgres` is an
ExternalName alias for the future CloudNativePG read/write Service. This chart
supports one release per namespace because those dependency names are fixed.

The existing web image contains Docker's DNS address, `127.0.0.11`. Kubernetes
does not use that address. The chart mounts Nginx configuration and its startup
command reads the nameserver from the Pod's `/etc/resolv.conf`. It writes the
generated server configuration under writable `/tmp`; the image stays unchanged.
The real web image passed `nginx -t` with this configuration while running as
UID 101, with a read-only root filesystem and all capabilities dropped.

## What Helm adds

Helm combines templates with **values** to generate Kubernetes YAML. The defaults
live in `values.yaml`; `local/values.yaml` and `ci/values.yaml` override only the
differences. CI renders two API replicas; local development renders one.
`values.schema.json` rejects unknown fields, root users, unimplemented production
mode, `latest` image tags and extra simulator replicas.

The chart currently targets Kubernetes 1.36. Use `--kube-version 1.36.5` when
rendering manually: Helm's built-in default can represent a newer Kubernetes
minor than our cluster. Generated files live in ignored `.tools/k8s/helm` on D:.
Rendering produces text; it does not create containers or consume cluster RAM.

## Credentials and permissions

A **ConfigMap** contains non-secret settings and startup scripts. A **Secret**
contains credentials, but base64 encoding alone does not encrypt them. This chart
references distinct existing Secrets rather than generating or embedding their contents
in Helm values, rendered files or Helm release metadata.

The required Secret contracts are:

| Secret value name | Required keys | Who receives it |
|---|---|---|
| `secrets.admin` | `database-url` | Migration Job only |
| `secrets.api` | `password`, `database-url` | API reads its URL; migration Job sets its role password |
| `secrets.ingest` | `password`, `database-url` | Ingest reads its URL; migration Job sets its role password |
| `secrets.mqttDevice` | `password` | Simulator |
| `secrets.mqttBridge` | `password` | Local bridge |

Database URLs use host `postgres`, database `kinetiq`, and the matching database
identity. Local generated role passwords are 64 hexadecimal characters. Secret
provisioning and database execution are exercised in the next step; do not create
fake credentials in tracked values just to make a Pod start.

Each workload receives its own **ServiceAccount** with token mounting disabled.
The application needs database or MQTT access, not Kubernetes API privileges.
Pods run as non-root, use the default seccomp profile, cannot gain privileges,
drop Linux capabilities and have read-only root filesystems. Only `/tmp` is
writable, with a 64 MiB size limit. Secret mounts use mode 0440 (decimal 288 in
YAML) and the Pod's filesystem group. This does not make credential rotation
automatic: services read credentials at startup and must be restarted after a
coordinated rotation.

## Health and update behavior

A **startup probe** gives a process time to initialize. A **liveness probe**
checks whether it should be restarted. A **readiness probe** determines whether
it should receive traffic. A temporary database outage should make the API
unready rather than cause an endless restart loop, so live and ready endpoints
remain separate. Web readiness checks Nginx; API readiness separately checks its
database. Web readiness alone does not prove the data pipeline is healthy.

API, ingest and web use rolling updates with one extra Pod allowed and zero
unavailable Pods requested. This is a rollout policy, not a high-availability
guarantee on a single node. Simulator and bridge use **Recreate**: old Pods stop
before replacements start. Their MQTT client IDs are fixed; two simultaneous
copies would disconnect one another. This accepts a brief local publishing gap
to preserve session identity. Ingest tolerates duplicate SQS delivery through
the existing idempotent inserts.

## Setup Jobs and migration safety

A **Job** runs work to completion rather than keeping a server running. The
migration Job applies checked migrations, seeds the fictional fleet and sets
restricted service-role passwords. The queue Job creates the local queue, DLQ
and redrive policy and verifies LocalStack's returned queue URL. We checked the
configured URL against the running Compose emulator rather than guessing its
path. Both Jobs have bounded retries and a ten-minute deadline.

These are ordinary Jobs with Helm revision names, not pre-install hooks. They
can start alongside Deployments, which may retry until dependencies are ready.
Future installation scripts must wait for both Jobs and service readiness before
calling acceptance successful. The GitOps step will add Argo CD sync ordering;
revision naming alone is not an Argo CD migration strategy.

Use **expand/contract migrations**: first add backward-compatible structures,
deploy code that uses them, then remove obsolete structures in a later release.
Old Pods may still run while a migration executes. Helm rollback does not undo
database changes. Existing migrations use an advisory lock, transactions and
checksums; those protections do not make a destructive migration safe.

## Network rules

The default policy denies ingress and egress for application Pods. Explicit rules
permit DNS, Traefik → web → API, API/ingest/migrations → PostgreSQL,
simulator/bridge → MQTT, and ingest/bridge/queue setup → LocalStack SQS.
The chart allows no arbitrary internet egress or Kubernetes API access.
The future platform workloads need matching labels and their own ingress rules.

NetworkPolicies require an enforcing network implementation. Successful rendering
does not prove enforcement. We must test allowed and denied connections when the
dependencies run in the cluster. See the [Kubernetes policy documentation](https://kubernetes.io/docs/concepts/services-networking/network-policies/).

## Memory budget and laptop use

| Profile | Steady application limits | Update surges | Two setup Jobs | Conservative total |
|---|---:|---:|---:|---:|
| Local | 832 MiB | 576 MiB | 512 MiB | 1,920 MiB |
| CI | 1,088 MiB | 576 MiB | 512 MiB | 2,176 MiB |

These are configured limits, not measured usage. The calculation allows every
rolling Deployment to surge simultaneously and both Jobs to run together. Helm
refuses a render exceeding `budgetMi` (2,560 MiB by default). Database, emulators,
operators and Kubernetes itself are outside this application budget and must be
added before judging whether the complete stack fits.

Keep Docker/WSL's current memory allowance on this 16 GB laptop. Use Compose for
daily work and stop Kubernetes with `npm run k8s:stop`. For cluster tests, stop
Compose with `docker compose stop` first; this preserves its volumes. If the
complete measured system does not fit comfortably alongside your programs, run
that verification in a dedicated session, CI or a separate development machine.

## Verification and practice

```powershell
npm run helm:verify
npm run helm:smoke
```

The first command lints and renders both profiles, validates all 72 objects using
kubeconform 0.8.0 and pinned strict Kubernetes 1.36.5 schemas, then checks selectors,
credentials, security, network paths and memory. Seventeen regression checks prove
unsafe changes are rejected. Missing schemas are errors; none are skipped. The
first run downloads schemas to D:, subsequent runs use that cache.
The second command also checks the rendered Nginx configuration in Docker. Neither
command installs the chart. Schema validation cannot prove runtime correctness;
see [kubeconform's documented limits](https://github.com/yannh/kubeconform#limits-of-kubeconform-validation).

Open `.tools/k8s/helm/local.yaml`, find the API Deployment and follow its labels
to the `api` Service. Compare its live and ready probes. Then inspect the Secret
reference: you should see a name and key, never a password.

Try this rejected render using the installed Helm executable:

```powershell
.\.tools\k8s\bin\helm.exe template kinetiq infra/helm/kinetiq --kube-version 1.36.5 --set budgetMi=1024
```

Interview questions: Why do Pods need a Service? Why is readiness different from
liveness? Why must fixed MQTT client IDs avoid overlapping Pods? Why does a
valid chart not prove its NetworkPolicies work? Why can a Helm rollback leave
the database schema changed?

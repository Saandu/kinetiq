# Kinetiq: backend and DevOps learning guide

A companion to [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md). The plan says *what* to build. This guide explains *what every piece is, why it exists, what can go wrong with it, and how the plan deals with that*, assuming you know frontend development well and backend and DevOps not at all.

Runtime and platform versions are pinned in [STACK_VERSIONS.md](STACK_VERSIONS.md), checked on 5 October 2026. The complete architecture remains the goal; we build and verify it in the steps below.

Completed implementation lessons: [Phase 0 database foundation](lessons/PHASE_0_DATABASE.md), covering transactions, service roles, RLS, pooled connections, composite foreign keys, idempotency and partitions with the actual code and tests.

How to use it:

- Read Parts 1 and 2 once, top to bottom. They give you the mental model.
- Use the later parts as a reference: when we start building a piece, re-read its section first.
- Most sections end with **Limitations** and **What we do about it**. Those are the parts interviewers ask about.
- Words in **bold** the first time they appear are in the glossary at the end.

Contents: Part 1 mental model · Part 2 foundations · Part 3 application components · Part 4 containers, Kubernetes and GitOps · Part 5 cloud plumbing · Part 6 testing · Part 7 how we'll work · Glossary.

---

# Part 1. The mental model

## 1.1 What Kinetiq is today

Today, everything happens inside the visitor's browser:

```
Browser
 ├─ Vue components (what you see)
 ├─ Pinia stores (fleet.ts, settings.ts, ui.ts): hold state for the components
 └─ telemetryService.ts  ←  "the data seam"
       ├─ simulator.ts: invents machine data with deterministic maths
       └─ storage.ts: saves your edits in localStorage
```

Nothing leaves the browser. The "anomaly score" and "confidence" on the detail page are numbers the simulator makes up so the UI has something to show. If two people open the demo, each sees their own private copy; if you toggle maintenance mode, nobody else sees it.

You already did one very smart thing: `TelemetrySource` in `src/services/telemetryService.ts` is an **interface**. The stores don't care *where* data comes from; they only call `listMachines()`, `getTelemetry(id)` and so on. That interface is the exact point where we plug in a real backend. The frontend changes are small because of it.

## 1.2 What "a backend" means

A **backend** is all the software that runs on computers you control (not on the visitor's device). It exists because some things can't or shouldn't happen in a browser:

| Need | Why the browser can't do it |
|---|---|
| Shared truth | Each browser has its own memory. A database on a server is one place everybody reads from. |
| Keeping secrets | Anything sent to a browser can be read by its user. Database passwords, signing keys and business rules that must not be bypassed live on the server. |
| Running when nobody is looking | Machines send data 24/7; analytics run every minute; alerts are emailed at 3 a.m. A browser tab isn't open then. |
| Trust | A user can edit any JavaScript in their own browser. The server re-checks everything ("is this person allowed to change this machine's settings?"). |
| Heavy or specialised work | Training a machine-learning model or scanning millions of rows. |

The browser becomes a **client**: it asks the backend for data and asks it to make changes. The backend decides whether to agree.

**DevOps** is the other half of your new role: *how that backend software gets packaged, deployed, run, watched and fixed*. A developer who can also do this is far more useful on a small team, and that's the skill set Docker, Kubernetes and CI/CD represent.

## 1.3 The life of one sensor reading (the whole system in one story)

This is the most important section. Every component in the plan exists to do one step of this story.

1. **A machine measures itself.** Mill `mill-01` reads its temperature (61.2 °C), vibration, spindle speed and power. In our project, the "machine" is a program called the **simulator** pretending to be 12 machines.
2. **It sends the reading over MQTT.** Factory equipment doesn't make web requests; it speaks **MQTT**, a lightweight messaging protocol. The machine collects a reading every 10 seconds and, once a minute, publishes the six readings as one small JSON message (a **batch**: AWS charges per message, so batching cuts the cost six times) to an address called a **topic**: `kinetiq/werk-nord/mill-01/telemetry`.
3. **AWS IoT Core receives it.** IoT Core is Amazon's managed MQTT **broker** (the post office of MQTT). It checks the machine's identity certificate: is this really `mill-01`, and is it allowed to publish here?
4. **An IoT Rule copies it into a queue.** A rule is a small filter ("every message on `kinetiq/+/+/telemetry`, send to this queue"). The queue (**SQS**) is a waiting room: messages sit there until something takes them.
5. **The ingest service writes it to the database.** A small Node.js program running continuously in a container asks the queue for waiting messages, takes up to 10 at once, checks they're well-formed, and inserts them into **PostgreSQL** in one go.
6. **Open browsers get told.** After inserting, ingest sends a tiny "new data for mill-01" signal through Postgres itself (`NOTIFY`). The API servers are listening (`LISTEN`) and push the new values over a **WebSocket** to anyone looking at the dashboard, so numbers change without refreshing.
7. **Every minute, Python analyses it.** Kubernetes starts a Python job that reads the last 30 minutes for each machine, computes "how unusual is this?" (an anomaly score), turns that into a health score, writes it to the database and exits.
8. **If health is bad, an alert opens.** Python sends an "alert" event into a second queue. The alerts service saves the alert, emails subscribed users and notifies the dashboard.
9. **An operator looks and reacts.** The operator signs in (via **Cognito**), the dashboard calls the **API** (`GET /v1/machines/mill-01/telemetry`), and the operator clicks "maintenance mode".
10. **The command travels back to the machine.** The API writes "desired: maintenance on" into the machine's **Device Shadow** in IoT Core. The simulator is subscribed, applies it, reports "reported: maintenance on", and the UI changes from "pending" to "applied".

Where do the Node and Python programs in steps 5-10, and PostgreSQL itself, actually run? Every one of them is packaged as a **Docker container**, and all containers run on one **Kubernetes** cluster on one rented server (either on AWS or on Hetzner; that choice is still open, see plan Section 9). **Argo CD** keeps that cluster identical to what the git repository says should run. Part 4 explains all three.

```
   AWS managed services                     One rented server running Kubernetes (k3s)
 ┌─────────────────────────────┐         ┌──────────────────────────────────────────────────┐
 │ IoT Core ──rule──► SQS ─────┼────────►│ ingest ──► PostgreSQL ◄── api ◄──┼── HTTPS/WSS ── browser
 │   ▲   │ Device Shadow       │         │             ▲   │ NOTIFY → api (live push)  │
 │   │   ▼                     │         │   scorer ───┘   └──► backups to S3          │
 │ simulator (MQTT)            │◄────────┤   scorer ──► alert queue ──► alerts ──► email│
 │ Cognito · S3 · SES          │         │   Argo CD keeps all of this equal to git     │
 └─────────────────────────────┘         └──────────────────────────────────────────────────┘
```

(The simulator also runs as a container in the cluster; it connects to IoT Core over the internet exactly as a real machine would.)

## 1.4 Four ideas that explain most design decisions

**Decoupling.** Each step only knows about the next one through a well-defined hand-off (a topic, a queue, a table, an HTTP route). If the database is slow for a minute, messages pile up in the queue instead of being lost. If you rewrite the analytics, the ingest service doesn't change.

**Things fail, so plan for it.** Networks drop, processes crash, messages get delivered twice, servers die. Production engineering is mostly answering "what happens when this step fails halfway?". You'll see this in retries, dead-letter queues, idempotent inserts, health probes, alarms and the disposable server.

**Declare what you want, let a system make it so.** Instead of running commands by hand ("start this, then that"), you write down the desired end state (a CDK file, a Helm chart) and a tool makes reality match it and keeps it matching. This idea appears three times: AWS CDK for cloud resources, Kubernetes for containers, Argo CD for deployments. It's also what the Device Shadow does for machines.

**You pay for what runs.** In the cloud every resource has a price per hour, per request or per gigabyte. Many choices (one server instead of three, spare-capacity "Spot" pricing or a cheaper provider, Postgres run by ourselves instead of a managed database, no load balancer, no NAT Gateway, batching device messages) keep the monthly bill under $20. Every one of those choices trades something away, and the README says what.

---

# Part 2. Foundations you need before anything else

## 2.1 How computers talk: HTTP, requests and responses

You use HTTP every day through `fetch`. The backend side of it:

- A **server** is a program that listens on a network **port** (a numbered door on a computer: HTTPS is 443, Postgres is 5432) and answers requests.
- A **request** has a method (`GET` read, `POST` create, `PUT` replace, `PATCH` partially change, `DELETE` remove), a path (`/v1/machines/mill-01`), **headers** (metadata such as `Authorization: Bearer <token>`) and optionally a body (usually JSON).
- A **response** has a **status code** and a body.
  - `200 OK`, `201 Created`, `202 Accepted` (accepted, will finish later: used for machine commands), `204 No Content`, `304 Not Modified`.
  - `400 Bad Request` (your input is malformed), `401 Unauthorized` (I don't know who you are), `403 Forbidden` (I know who you are, and you're not allowed), `404 Not Found`, `409 Conflict`, `429 Too Many Requests` (rate limited).
  - `500 Internal Server Error` (the server's fault), `503 Service Unavailable`.
- An **API** (Application Programming Interface) is the set of requests a server agrees to answer, with their exact shapes. Ours is described in plan Section 4.

**HTTPS** is HTTP inside **TLS**, the encryption layer. TLS also proves the server's identity with a **certificate** issued for a **domain name** (that's why the plan needs a domain: free certificates from **Let's Encrypt** are issued for names, and your HTTPS Firebase frontend is not allowed to call a plain-HTTP API). Remember certificates; MQTT devices use them too, in both directions.

## 2.2 Where code runs

| Model | What it is | Billing | In Kinetiq |
|---|---|---|---|
| **Virtual machine** (AWS EC2, Hetzner Cloud server) | A rented computer, running all the time | Per hour, even when idle | The one server our Kubernetes runs on |
| **Container** | Your program plus everything it needs, packaged as an image; many can share one machine | Whatever the machine underneath costs | Every service, and PostgreSQL |
| **Container orchestrator (Kubernetes)** | Software that runs many containers, restarts failed ones, routes traffic to them, scales them | The machines it uses (plus a fee for managed versions like EKS) | k3s on our server |
| **Serverless function (Lambda)** | You upload one function; AWS runs it only when triggered | Per call and per millisecond | Not used. The plan's first version did; Part 3.5 explains why we switched |
| **Managed service** | The cloud runs a whole product for you (database, queue, sign-in) | Per hour, request or GB | SQS, IoT Core, Cognito, S3, SES (all nearly free at our size) |

A common rule in companies: **run your own code in containers; let the cloud run commodity infrastructure** (databases, queues, sign-in), because operating those well is a full-time job. We follow it for queues, IoT and sign-in, which are nearly free. We break it for the database, on purpose, because a managed database (RDS) would more than double the monthly bill. That's a legitimate, explainable trade-off, and running a database on Kubernetes yourself teaches backups and recovery properly (3.6).

## 2.3 What a database is, and why PostgreSQL

A **relational database** stores data in **tables** (like spreadsheets with strict column types). You talk to it in **SQL**:

```sql
SELECT ts, temperature_c
FROM telemetry
WHERE machine_id = 'mill-01' AND ts > now() - interval '1 hour'
ORDER BY ts;
```

Concepts you need:

- **Row / column**: one record / one field. Each column has a type (`text`, `real`, `timestamptz`, `uuid`, `jsonb`).
- **Primary key**: the column(s) that uniquely identify a row. For telemetry it's `(machine_id, ts)`: a machine can't have two readings at the same instant.
- **Foreign key**: a column pointing at another table's primary key (`machines.site_id` → `sites.id`). The database refuses rows that point at nothing.
- **Index**: a sorted lookup structure, like a book index. Without it, "find mill-01's last hour" scans every row ever written. With it, it jumps straight there.
- **Transaction**: a group of statements that either all succeed or all fail (`BEGIN … COMMIT`). Example: "insert the alert *and* write the audit-log entry" must not half-happen.
- **Migration**: a versioned SQL file that changes the schema ("create table alerts", later "add column resolved_at"). Migrations run in order, so every environment (laptop, CI, AWS) ends up with the identical structure. You never click-edit a production schema.
- **Connection**: a client must open a connection (a network session with login) before sending SQL. Each one costs Postgres memory (a separate process), so a small database allows only around 100. A **connection pool** is a small set of connections a long-running program opens once and reuses for every request. This matters a lot (Part 3.5).

**Why PostgreSQL** and not Firestore, which you know? Firestore is a document store you reach directly from the browser, protected by security rules. Postgres is the most-requested database in job ads, enforces relationships and types, and lets us show real techniques (partitioning, row-level security, roll-ups). Only the backend talks to it.

**Who runs Postgres?** Two options:
- **RDS** (Relational Database Service): AWS runs Postgres for you (installation, patches, backups, disk) for ~$15/month at the smallest size. The standard choice when there's a budget.
- **Ourselves, inside Kubernetes**, with **CloudNativePG**, an **operator**: software that encodes what a database administrator does (create the database, create users, take backups, restore, upgrade) and does it automatically. Costs nothing extra. Our choice, explained fully in 3.6. The hard part: our server is disposable (Part 4.8) and a database must not be, so the data lives on a separate disk and is continuously backed up to S3.

## 2.4 Authentication vs authorization

- **Authentication (AuthN)**: *who are you?* Proven by signing in.
- **Authorization (AuthZ)**: *what are you allowed to do?* Decided by rules: "operators can toggle maintenance mode; only engineers can change model settings".

Cognito does the first; our API code and the database do the second. Details in Part 3.9.

## 2.5 AWS basics: account, region, availability zone, IAM

- **Account**: your AWS "tenancy", with its own bill. A new account just for Kinetiq isolates its cost and permissions.
- **Region**: a geographic cluster of data centres (`eu-central-1` is Frankfurt). Resources live in one region.
- **Availability Zone (AZ)**: an independent data centre inside a region (Frankfurt has three). Spreading across AZs survives one going down. We run one server and one database in single AZs to save money; that's a documented limitation.
- **IAM** (Identity and Access Management): the permission system for *everything* in AWS. Every request to AWS is checked against IAM policies. Part 5.2.

## 2.6 Asynchronous code, and the first change you'll make

Today:

```ts
listMachines(): Machine[]   // returns instantly, the data is already in memory
```

With a backend, the data is across the network, which takes time and can fail. So the method must return a **Promise**:

```ts
listMachines(): Promise<Machine[]>   // "I'll give you the machines later, or an error"
```

Every store that calls it must `await` it and handle three states: *loading*, *loaded*, *failed*. That's Phase 0, and we do it *before* writing any backend code, keeping `LocalTelemetrySource` (wrapped in `Promise.resolve`) so all existing tests keep proving nothing broke. A production habit: **change one thing at a time, with tests green at each step.**

### Phase 0a implementation: where asynchronous state belongs

The Vue app now lives in `apps/web`. A **workspace** is a package inside one repository: npm links its dependencies and uses the root lockfile so CI installs the same versions. Run commands from the repository root; Firebase publishes `apps/web/dist`.

Every TelemetrySource method returns a Promise, including local reads and writes. The local adapter still simulates all data in the browser. No HTTP adapter or backend is delivered by this change.

A computed getter must remain synchronous: it reads a resolved snapshot. The fleet store performs requests in actions and stores their results in refs. Roster and selected-machine requests have separate loading/error state. A **request generation** is a counter attached to each request: when navigation starts a newer request, an old response is ignored. This prevents a slow pump response overwriting the mill currently on screen.

Polling still uses one shared visibility-aware timer. It does not start another poll while the previous request or a fleet write is pending, and the store stops its timer/listener on disposal. Explicit navigation can supersede an in-flight selection request.

Writes are awaited. A failed write keeps the previous telemetry and settings draft; a success toast appears only after the adapter confirms completion. Settings saves capture the intended panel and merge it with saved settings so saving state names does not commit unsaved alert thresholds. Settings cannot be saved until the requested machine's settings have loaded. With a future remote API, atomic panel updates and concurrency control must also be enforced server-side.

Try `npm run dev`: change a state name, save only that panel, toggle maintenance, refresh a machine deep link and reset demo data. The failure and stale-response scenarios are tested with deliberately delayed/rejected adapters in `apps/web/tests/async-telemetry.test.ts`.

## 2.7 The command line

Backend and DevOps work happens mostly in a terminal. You'll use: `docker` / `docker compose` (containers), `kubectl` (talk to Kubernetes), `helm` (install charts), `k3d` (local clusters), `psql` (talk to Postgres), `aws` (AWS CLI), `cdk` (infrastructure), `uv` (Python), `npm`, `git`, `curl` (send HTTP requests by hand). Every time we use a new command I'll explain what it does and what its output means.

---

# Part 3. The application, component by component

Each section: what it is → how it works → why we chose it → limitations → what we do about them.

## 3.1 The device simulator

**What it is.** A Node.js/TypeScript program that pretends to be 12 (or up to 500) machines. Each pretend machine connects to the MQTT broker and publishes a reading every 10 seconds.

**How it differs from today's `simulator.ts`.** Today's simulator produces *finished* numbers for the UI (availability %, anomaly score). The new one produces only *raw sensor readings*. Everything derived (availability, anomaly, health, predictions) is computed by the backend. That's the point: the backend does real work.

**Fault injection.** To test whether analytics detect problems, the simulator deliberately creates them: slowly rising vibration (bearing wear), a temperature ramp (overheating), power spikes, missing readings, going offline. It records each one, with start and end time, in `fault_events`. That's **ground truth**: we know exactly when a real fault happened, so we can measure how often and how quickly the analytics noticed.

**Where it runs.** On your laptop against a local broker; in production as a Kubernetes Deployment with one copy. For load tests with hundreds of devices, on a separate temporary server so it doesn't steal CPU from the services being tested.

**Limitations.** Simulated physics is simpler than reality, so detecting faults in it is easier than in a real factory. **What we do:** say so honestly, and also evaluate on a real public bearing dataset (3.7).

## 3.2 MQTT

**What it is.** A messaging protocol designed in 1999 for oil pipelines over satellite links: tiny messages, unreliable networks, weak devices. Standard in industrial IoT. You used it in 2023 from the browser, so you know the *client* side.

**Publish/subscribe.** Clients never talk to each other directly; they talk to a **broker**.

- A client **publishes** a message to a **topic**: `kinetiq/werk-nord/mill-01/telemetry`.
- A client **subscribes** to a topic or pattern: `+` matches one level (`kinetiq/+/+/telemetry` = telemetry from every site and machine), `#` matches everything below (`kinetiq/#`).
- The broker delivers each message to every current subscriber. The publisher doesn't know who they are.

**QoS (Quality of Service):**
- **QoS 0**, "at most once": fire and forget. Might be lost.
- **QoS 1**, "at least once": the receiver acknowledges; the sender retries until it does. Never lost, but **might arrive twice**.
- QoS 2, "exactly once": expensive handshake. AWS IoT Core doesn't support it.

We use QoS 1. Consequence you'll see everywhere: **duplicates are possible, so every later step must tolerate the same message twice.** That property is **idempotency** (3.4).

**Connection security.** MQTT runs over TLS (port 8883). With IoT Core *both* sides show a certificate (**mutual TLS**): the broker proves it's AWS, the device proves it's `mill-01` with its own **X.509 certificate** and **private key**. Whoever has the private key can pretend to be that machine, so it never goes into git.

**Why not HTTP from devices?** Real equipment uses MQTT; one open connection is cheap per message; and the broker can send messages *to* devices (commands).

**Locally** we run **Mosquitto**, a free broker, in a container.

## 3.3 AWS IoT Core

AWS's managed MQTT broker plus device management:

- **Thing**: the registry entry for one device (`mill-01`).
- **Certificate**: attached to a thing; proves identity when connecting.
- **IoT policy**: what a certificate may do. Ours says, using a variable AWS fills in from the connection: *connect only as your own thing name, publish only under `kinetiq/*/<your thing name>/…`*. A stolen `mill-01` certificate can't pretend to be `pump-03`.
- **Rule**: an SQL-like filter on incoming messages (`SELECT * FROM 'kinetiq/+/+/telemetry'`) with an **action** (send to SQS). Rules are how messages leave the MQTT world.
- **Device Shadow**: a JSON document AWS keeps per device, with `desired` (what the cloud wants) and `reported` (what the device says is true). When they differ, AWS sends the device a `delta`. This solves *"I sent a command while the device was offline"*: the desired state waits until it reconnects.

**Limitations.** Price per message (roughly $1 per million, plus connection and rule charges). One message every 10 seconds from 12 devices would be ≈ 3.1 M messages/month, a few dollars. Batching six readings into one message per minute brings it to ≈ 0.5 M, under $1. The trade-off: dashboard values update once a minute, which is fine for condition monitoring (spotting wear over hours) but would not be for controlling a machine in real time. Commands (Device Shadow) are not batched. Certificates and keys are fiddly; we create them from infrastructure code and store private keys in **Parameter Store** (5.3). A bug that publishes in a tight loop could cost real money, so the simulator has a hard rate cap and an alarm watches the message count.

## 3.4 SQS queues, retries, dead-letter queues and idempotency

**Why a queue?** Without one, every MQTT message would directly cause a database insert. 500 devices bursting means 500 simultaneous writes; if the database is briefly down (restart, patching) or our server is being replaced, messages are lost. A queue is a **buffer**:

- Messages wait safely (4 days by default, up to 14) until a worker is ready.
- The worker takes them in **batches** and does *one* insert with many rows, far cheaper than many inserts.
- If the worker fails, messages stay and are retried.

That's **back-pressure** handling: the slow part sets the pace; the fast part isn't affected. It's also why our whole server can disappear for 10 minutes without losing a single reading.

**How SQS delivery works.**
1. The ingest service asks for messages (**long polling**: "wait up to 20 s if the queue is empty", which avoids paying for thousands of empty requests).
2. Received messages become *invisible* to others for the **visibility timeout** (e.g. 60 s) but are *not* deleted.
3. After a successful insert, ingest deletes them.
4. If ingest crashes, the timeout expires and they become visible again: they'll be delivered again.
5. After `maxReceiveCount` (5) failed attempts, SQS moves a message to a **dead-letter queue (DLQ)**: a separate queue for "poison" messages that keep failing (e.g. malformed). One bad message can't block everything forever.

**Partial failure.** If 9 of 10 messages are fine and one is malformed, ingest inserts the 9, deletes only those, and leaves the bad one to be retried and eventually dead-lettered.

**At-least-once delivery.** Like MQTT QoS 1, standard SQS can deliver a message twice. So the insert must be **idempotent**: `INSERT … ON CONFLICT (machine_id, ts) DO NOTHING`. A duplicate has the same primary key, so the second insert does nothing.

**Graceful shutdown.** When Kubernetes stops an ingest container (during a deploy), it first sends a signal (`SIGTERM`). Our code must stop asking for new messages, finish the current batch, then exit. Otherwise a batch would be retried after the timeout, which is harmless thanks to idempotency but slower.

**Alarms.** "DLQ has more than 0 messages" means something is broken. The runbook explains how to inspect the messages and **redrive** them (move them back) once fixed.

## 3.5 Long-running services, connection pools, and why not Lambda

The first version of the plan ran our code on **AWS Lambda**: you upload a function, AWS runs a copy each time something happens, you pay per millisecond. It's cheap at low traffic and a valid choice. We switched to long-running containers. Understanding why is a good interview answer.

**A long-running service** is a program that starts once and keeps running, handling request after request:

```ts
const pool = new Pool({ max: 5 })        // opened once at start-up, reused forever
const app = Fastify()
app.get('/v1/machines', async () => (await pool.query('select …')).rows)
await app.listen({ port: 3000 })
process.on('SIGTERM', async () => { await app.close(); await pool.end() })  // graceful shutdown
```

Comparison:

| | Lambda | Long-running container |
|---|---|---|
| Idle cost | ~$0 | The server costs the same whether busy or not |
| Start-up | **Cold start** on first request after idle (100 ms to seconds) | Starts once; no per-request start-up |
| Database connections | Every running copy opens its own; a burst of 200 copies exceeds a small database's ~100 limit | A fixed pool (e.g. 5 per copy); total is known and capped |
| Long-lived connections (WebSocket, Postgres LISTEN) | Not possible inside a function; needs extra managed services | Natural |
| Max run time | 15 minutes per call | Unlimited |
| Where it runs | Only AWS | Anywhere containers run: laptop, CI, any cloud |
| What you learn | AWS-specific | Docker, Kubernetes: transferable to most companies |

**The connection budget.** Our Postgres is configured for 100 connections (each costs memory on a 4 GB server shared with everything else). We give each service a fixed pool (api 5 per copy plus 1 for LISTEN, ingest 3 per copy, alerts 2, analytics 2) and cap the maximum number of copies. A test adds up the worst case from the Helm values and fails if it exceeds 60. That turns "the database might fall over under load" into a number we control.

**Limitations of our choice.** We pay for the server even at 3 a.m. with no visitors, and one server is one point of failure. **What we do:** document both, make the server disposable and measure recovery (Part 4.8).

## 3.6 PostgreSQL in this project

The tables are in plan Section 3. What matters for understanding:

**Telemetry is a time series.** 12 machines × 6 readings/minute ≈ 104,000 rows a day, ~3 M a month; 500 machines is 40× that. Two techniques keep it manageable:

1. **Partitioning.** `telemetry` is split into one physical sub-table per day that queries see as one table. A query for "last hour" only touches today's partition; deleting data older than 30 days is `DROP` of one old partition (instant), instead of `DELETE` of millions of rows (slow, bloats the database). **pg_partman** creates future partitions and drops old ones; **pg_cron** runs it on a schedule inside the database.
2. **Roll-ups.** A month-long chart doesn't need every 10-second point. A scheduled job aggregates each hour into one row (`telemetry_hourly`: average, min, max), kept for a year. The API picks the table based on the requested range.

**Row Level Security (RLS).** Adds an invisible `WHERE` to every query on a table:

```sql
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON machines
  USING (organization_id = current_setting('app.organization_id')::uuid);
```

In each request's transaction, the API runs `SET LOCAL app.organization_id = '<the user's org>'`. Now even if a developer forgets `WHERE organization_id = …`, the database hides other organizations' rows. That's **defense in depth**: two independent locks.

Two traps (we'll write tests for both):
- The table owner bypasses RLS unless `FORCE` is set; superusers always bypass it. So services never connect as the master user.
- `SET LOCAL` lasts only until the transaction ends. Plain `SET` on a *pooled* connection would stay on it, and the next request, maybe from another organization, would inherit it. Connection pools make this trap real.

**Database roles (least privilege).** Each service logs in as its own role allowed only what it needs: `kinetiq_ingest` can insert telemetry and nothing else. If ingest were compromised, the attacker couldn't read user emails.

**Passwords that never leave the cluster.** CloudNativePG creates each role with a long random password and stores it as a Kubernetes Secret; each service's container gets only its own. Nobody types or sees these passwords, they're not in git, and Postgres has no public address at all: a network policy lets only our service containers connect, and connections are encrypted with TLS.

**Running Postgres ourselves: the operator, backups and recovery.** This is the part RDS would have done for us, so it gets extra care:

- **The operator.** We don't install Postgres by hand. We give Kubernetes a short `Cluster` description ("Postgres 18, 1 instance, 10 GB, these roles, back up to this S3 bucket") and CloudNativePG creates and runs it, the same desired-state idea as everywhere else (Part 4.3).
- **The write-ahead log (WAL).** Postgres writes every change to a log *before* changing the actual tables, so it can recover from a crash. CloudNativePG continuously copies these log files to S3 (**WAL archiving**), at least every 5 minutes.
- **Base backups.** Once a night, a full copy of the database goes to S3.
- **Point-in-time recovery (PITR).** Base backup + the WAL files after it = you can rebuild the database as it was at any moment, e.g. "10:42, just before someone ran a bad migration". That's a skill companies value, and few portfolio projects demonstrate it.
- **RPO (recovery point objective)**: how much data you could lose in the worst case. Ours is at most 5 minutes of writes (the archive interval), and telemetry from that window is usually still in SQS.
- **RTO (recovery time objective)**: how long recovery takes. We'll measure it in the recovery drill.
- **Separate data disk.** The database files live on their own disk (a **volume**), not on the server's main disk. When the server is replaced, the new one reattaches that disk and Postgres continues. If the disk itself were lost, we restore from S3. We'll prove the reattach path works in Phase 1 before relying on it.
- **Restore tests.** Once a month a job restores the latest backup into a temporary database and checks it. A backup nobody has ever restored is a hope, not a backup.

**Limitations.** One Postgres instance on one server: if it's down, the app is down (readings wait in SQS). No replica to fail over to. Postgres shares 4 GB of memory with everything else, so it's tuned small; fine for 12 devices, and the load test will show where it stops. **Production answer:** CloudNativePG with 2-3 replicas on separate nodes (it handles automatic failover), or RDS Multi-AZ. Documented in the README.

## 3.7 The Python analytics service

**Why Python?** Data analysis and machine learning live in the Python ecosystem: **numpy** (fast arrays), **pandas** (tables in memory with time-series tools: resampling, rolling windows), **scikit-learn** (classic ML algorithms). Showing Python is also an explicit goal.

**What runs, and when.** One Docker image, three uses:
- **Scorer**: a Kubernetes **CronJob** every minute. It starts, reads the last 30 minutes per machine, computes features and scores, writes `machine_health` rows, opens/resolves alerts, and exits.
- **Trainer**: a CronJob every night. Retrains each machine's model on its last 7 days of normal behaviour; saves the model file in **S3**.
- **Internal API** (FastAPI): a long-running Deployment the Node API can ask "recompute now" or "explain this score". Only the API's containers can reach it (a network policy, Part 4.6).

**The algorithms, explained with numbers.**

*Features.* Raw readings every 10 s are noisy. We summarise a window (30 minutes = 180 readings) into a few numbers: average vibration, its spread (standard deviation), maximum, slope (rising or not), average temperature and its slope, power per rpm, time share per operating state. These are the **features**.

*Detector A: robust z-score.* "How many 'typical spreads' away from normal is this value?"
- Normal z-score: `(value − mean) / standard deviation`. Problem: one past spike drags the mean and inflates the standard deviation, blinding the method.
- Robust version: the **median** (middle value) and **MAD** (median absolute deviation: the median distance of values from the median). Outliers barely move them.
- Example: last week's vibration in this operating state had median 2.4 mm/s and MAD 0.2. Now it reads 3.4. Robust z = (3.4 − 2.4) / (1.4826 × 0.2) ≈ 3.4. The 1.4826 makes MAD comparable to a standard deviation for normally distributed data. Above about 3 is rare, so this is unusual.
- Per metric; the largest becomes the 0-100 score. The per-metric values are the **contributors**: *flagged mainly because of vibration*.
- "Same operating state" matters: a mill at full speed is supposed to vibrate more than one idling.

*Detector B: Isolation Forest.* Build many random decision trees that split data with random cuts ("vibration > 2.7?", "temperature < 58?"). A normal point sits in a crowd and needs many cuts to isolate; an anomaly is far away and gets isolated in few cuts. Fewer cuts on average → more anomalous. It's **unsupervised** (learns "normal" without labelled faults) and catches *combinations* that are individually normal (normal temperature, but too high for this low power), which the z-score can't.

*Health score.* `100 − anomaly score`, smoothed with an **exponential moving average**: `smoothed = 0.3 × new + 0.7 × previous`. One noisy minute moves it a little; a persistent problem moves it steadily. No flickering dashboard.

*Confidence.* Lower when the window has few readings or the model is old. Below a threshold, the UI shows "insufficient data" rather than a misleading number.

*Forecast ("next maintenance").* Fit a straight line (**linear regression**) through hourly vibration over 72 hours. If it rises and fits well (**R²** ≥ 0.5; R² from 0 to 1 says how much of the variation the line explains), extend it to where it crosses the warning level → estimated date. Poor fit → no prediction.

**Measuring quality.** Using ground truth:
- **Precision**: of all alerts raised, how many were real faults? (few false alarms)
- **Recall**: of all real faults, how many did we catch? (few misses)
- Trade-off: a more sensitive threshold raises recall and lowers precision.
- **Detection delay**: time from fault start to first alert.
- **False alerts per machine per day**: what operators feel. Too many and people ignore alerts.

Two benchmarks: our own simulated faults (deterministic, runs in CI), and the public **NASA IMS bearing dataset** (real bearings run until they failed), so we're not only detecting faults we invented.

**Python tooling.** **uv** (installs Python and packages, like npm, very fast), **ruff** (linter + formatter, like ESLint + Prettier), **mypy --strict** (type checker, like `tsc`), **pytest** (test runner, like Vitest), **hypothesis** (generates hundreds of random inputs to find edge cases), **Pydantic** (runtime validation, Python's Zod), **SQLAlchemy Core + psycopg** (talk to Postgres), **uvicorn** (the server that runs FastAPI).

## 3.8 The API (Fastify)

**What it is.** The only door the browser uses to reach data, built with **Fastify**, a Node.js web framework (like Express, faster, better TypeScript support):

```ts
app.get('/v1/machines/:id/telemetry',
  { schema: { params: MachineIdParams, response: { 200: Telemetry } } },
  async (req) => { /* verify user, check org, query DB, return JSON */ })
```

It runs as 2 copies (**replicas**) in Kubernetes. Requests arrive at **Traefik**, the cluster's entrance (Part 4.6), which forwards each one to a healthy copy.

**Validation with Zod.** Every input is checked against a **schema** before our code touches it; malformed input → automatic `400`. The same schemas generate the **OpenAPI** document (machine-readable API description) and TypeScript types the Vue app imports, so frontend and backend can't silently disagree. That's `packages/contracts`.

**Conventions (plan Section 4), explained.**
- **problem+json (RFC 9457)**: errors have a standard shape and never include stack traces, which leak internals to attackers.
- **Cursor pagination**: lists return a page plus a `nextCursor` instead of everything.
- **ETag / If-None-Match**: the server fingerprints a response; the client sends the fingerprint back; if nothing changed, `304 Not Modified` with no body.
- **Idempotency key**: the client sends a random `Idempotency-Key` with a `POST`. If the network drops and it retries, the server recognises the key and returns the original result instead of creating a duplicate. Stored in Postgres so every replica sees it.
- **Request ID**: unique per request, in every log line and the response, so you can trace one user's problem.
- **Rate limiting**: requests per user per time unit (`429` beyond). Stored in Postgres, not memory, because with 2 replicas an in-memory limit would effectively double.
- **Audit log**: who changed what, when.
- **Health endpoints**: `/healthz` ("the process is alive") and `/readyz` ("I can reach the database and am ready for traffic"). Kubernetes calls them constantly (Part 4.4).

## 3.9 Sign-in: Cognito, JWTs, PKCE and roles

**Cognito** is AWS's user directory and sign-in service (like Firebase Auth): users, passwords, MFA, tokens.

**JWT (JSON Web Token).** After sign-in, Cognito gives the browser tokens. A JWT is three base64 parts: `header.payload.signature`.
- The **payload** is readable JSON: `{ "sub": "user id", "cognito:groups": ["engineer"], "exp": 1760000000 }`.
- The **signature** is created with Cognito's *private* key and checked with its *public* key. Nobody can forge it. If a user edits the payload to say `"admin"`, the signature no longer matches and the token is rejected.
- Tokens expire (1 hour by default). A **refresh token** gets new ones silently.
- The browser sends it on every request: `Authorization: Bearer eyJ…`. Our API verifies signature, expiry, issuer and audience with the `aws-jwt-verify` library before any route code runs.

**PKCE ("pixie").** The secure sign-in flow for apps that can't keep a secret (all browser code is public):
1. The app creates a random secret (`code_verifier`) and sends only its hash (`code_challenge`) when redirecting to Cognito's login page.
2. After login, Cognito redirects back with a short-lived *code*.
3. The app exchanges code + original verifier for tokens; Cognito checks the verifier matches the hash.
An attacker who intercepts the code can't use it without the verifier.

**Roles.** Users are in Cognito **groups** (`operator`, `engineer`, `admin`), which arrive inside the JWT. Each route checks them (`403` if not allowed). The organization comes from our `app_users` table and drives RLS.

**Tokens in memory, not `localStorage`**, because injected malicious JavaScript (**XSS**) can read `localStorage`.

**Demo visitors.** Most recruiters won't sign in, so the landing view is a public read-only overview. The "Enter as operator / engineer" buttons call `POST /demo-session`: the *server* signs in a demo account and returns its tokens, so no demo password sits in frontend code.

## 3.10 Live updates: polling, WebSockets, LISTEN/NOTIFY

**Polling**: the browser asks "anything new?" every N seconds. Simple and robust, but delayed and wasteful.

**WebSocket**: a connection that stays open so the *server* can push any time. Our API containers accept WebSocket connections on `/ws` (checking the token first).

**The multi-replica problem.** We have 2 API copies. Browser A is connected to copy 1, browser B to copy 2. Ingest inserts new data: how do *both* copies find out? They need a shared channel. Postgres has one built in:
- Ingest runs `NOTIFY telemetry, '{"machineId":"mill-01"}'` after inserting.
- Each API copy keeps one dedicated connection running `LISTEN telemetry`, gets the notification, and pushes to its own connected browsers.

**Limitations.** Notifications go only to sessions listening at that moment (missed while an API copy restarts); payloads must stay under 8,000 bytes; connections drop. **What we do:** send only small "something changed" signals, have the browser fetch details by HTTP, reconnect automatically, fall back to polling while disconnected, and show a connection indicator. At much larger scale you'd use Redis or a message broker.

## 3.11 Commands back to machines

1. Operator clicks "maintenance on". The API checks role, writes the audit log, updates the shadow (`desired.maintenanceMode = true, version = 7`), saves `desired_version = 7`, returns **202 Accepted**. UI: **pending**.
2. The shadow sends a `delta` to the simulator, which applies it and reports `reported … version = 7`.
3. A rule forwards that report through the queue; ingest updates `reported_version = 7`. UI: **applied**.
4. No report within 60 s → UI: **failed / still pending**.

"Desired vs reported" is how real IoT works and exactly how Kubernetes works (Part 4.3). Good interview topic.

## 3.12 Alerts and email

Python decides *that* an alert should open (health below threshold for N consecutive minutes, so one bad minute doesn't trigger it) and sends an event to the alert queue. The alerts service:
- inserts it with a **dedupe key** (`machine + kind + level`), unique while open, so an ongoing problem doesn't create 60 alerts an hour;
- emails subscribers through **SES** (Simple Email Service). New SES accounts start in a **sandbox** that only emails verified addresses, fine for a demo;
- notifies dashboards (NOTIFY again).

---

# Part 4. Containers, Kubernetes and GitOps

## 4.1 The problem containers solve

Your API needs Node 24 LTS, a set of npm packages and some environment variables. The analytics needs Python 3.14 and numpy compiled for the right CPU. Without containers, every machine (your laptop, a colleague's, CI, the server) must be set up identically by hand, and they drift: "works on my machine".

A **container** packages the program *with* its runtime and dependencies into one unit that runs identically everywhere Docker runs. It's not a virtual machine: containers share the host's operating system kernel, so they start in a second and use little memory. That's why one 4 GB server can run a dozen of them.

## 4.2 Docker in practice

**Dockerfile**: the build recipe. Ours are **multi-stage**:

```dockerfile
# Stage 1: build. Has compilers, dev dependencies, the TypeScript source.
FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci                      # install exactly what package-lock.json says
COPY . .
RUN npm run build               # TypeScript → JavaScript

# Stage 2: runtime. Only what's needed to run. Smaller and safer.
FROM node:24.21.0-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node                       # don't run as root
CMD ["node", "dist/server.js"]
```

Why two stages: the final image doesn't contain compilers, source code or dev tools. Smaller image = faster deploys and fewer things an attacker could use.

**Layers and caching.** Each instruction creates a cached **layer**. Copying `package*.json` and running `npm ci` *before* copying the source means changing one `.ts` file doesn't reinstall all packages. Order matters for speed.

**Image, tag, registry.**
- `docker build -t kinetiq-api:abc123 .` builds an **image** tagged `abc123`.
- We tag with the git commit SHA, never `latest` in production, so you always know exactly which code is running and can roll back to an exact version.
- Images are pushed to a **registry**: ours is **GitHub Container Registry (GHCR)**, free for public images, next to the code. Amazon ECR is the AWS-native alternative (a few cents a month, private); the README names it.

**CPU architecture.** Our server uses AWS Graviton (**arm64**), like Apple Silicon. Images must be built for arm64; GitHub provides arm64 build machines. We also build amd64 so they run on Intel laptops.

**Image scanning.** **Trivy** checks every image for known vulnerabilities in the OS packages and libraries; CI fails on fixable serious ones. **hadolint** lints Dockerfiles for bad practices.

**docker compose.** A YAML file describing several containers that run together (Postgres, Mosquitto, LocalStack, api, ingest…), started with `docker compose up`. Our everyday development environment: whole system, one command, no cloud, no cost. **LocalStack** imitates AWS services like SQS locally.

**Limitations.** Containers share the host kernel, so isolation is weaker than separate virtual machines; that's why we run as non-root with a read-only filesystem and dropped privileges. Docker on Windows runs inside a small Linux VM (WSL 2), so give it enough memory.

## 4.3 What Kubernetes is

Docker runs containers on one machine when you tell it to. In production you want more: restart crashed containers, run several copies and spread traffic across them, roll out new versions without downtime, run jobs on a schedule, scale with load, inject configuration and secrets. **Kubernetes** (K8s) does all of that.

The key idea is **desired state and reconciliation**. You don't say "start a container". You submit a description: "there should be 2 copies of `kinetiq-api:abc123`, each with 256 MB of memory". Kubernetes has **controllers**, loops that constantly compare desired state with reality and act on the difference. A copy crashes → reality is 1, desired is 2 → it starts one. You change the image tag → it gradually replaces old copies with new ones. Same pattern as the Device Shadow.

**Architecture in brief.**
- The **control plane** is the brain: the **API server** (everything, including `kubectl`, talks to it), a store holding the desired state, the **scheduler** (decides which machine runs each container) and the controllers.
- **Nodes** are the machines that run containers; on each one, the **kubelet** agent starts and watches them.
- In our setup, one server is both control plane and node.

**k3s** is a lightweight, fully certified Kubernetes distribution: one small binary, low memory, with batteries included (Traefik ingress, a local load balancer, network policy support). The YAML you write is the same as for big managed clusters (EKS on AWS, GKE on Google, AKS on Azure); what differs is who operates the control plane. **k3d** runs k3s inside Docker on your laptop, so a "cluster" is seconds away and free.

Why k3s and not EKS: EKS charges about $73/month just for the control plane before any servers. k3s gives the same Kubernetes API on our one server. Trade-off: on EKS, AWS keeps the control plane highly available and upgraded; with k3s, that's our job.

## 4.4 Kubernetes objects you'll write

You describe everything as **objects** in YAML. The ones in Kinetiq:

**Pod**: the smallest unit, one or more containers that run together. You rarely create Pods directly; controllers create them.

**Deployment**: "keep N identical Pods of this image running". Handles **rolling updates**: start a new Pod, wait until it's ready, stop an old one, repeat, so there's no downtime. Our api, ingest, alerts, analytics-api and simulator are Deployments.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: api }
spec:
  replicas: 2
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec:
      containers:
        - name: api
          image: <account>.dkr.ecr.eu-central-1.amazonaws.com/kinetiq-api:abc123
          ports: [{ containerPort: 3000 }]
          resources:
            requests: { cpu: 100m, memory: 128Mi }   # reserved for scheduling
            limits:   { memory: 256Mi }              # killed if it uses more
          readinessProbe: { httpGet: { path: /readyz, port: 3000 } }
          livenessProbe:  { httpGet: { path: /healthz, port: 3000 } }
```

**Probes.**
- **Readiness**: "can this Pod take traffic now?" If not (e.g. database unreachable), it's removed from rotation but not killed.
- **Liveness**: "is this Pod stuck?" If it fails repeatedly, Kubernetes restarts the container.
- Getting them wrong is a classic outage: a liveness probe that checks the database will restart *every* Pod when the database blips, making things worse. So liveness checks only the process; readiness checks dependencies.

**Resources (requests and limits).** **Requests** reserve CPU and memory so the scheduler knows what fits; **limits** cap usage. Over the memory limit, the container is killed (**OOMKilled**, Out Of Memory). On a 4 GB node, the sum matters, so a test adds up every request.

**Service**: a stable internal name and address for a set of Pods (`analytics-api.kinetiq.svc`), since Pods come and go with changing IPs. Traffic is spread across ready Pods.

**Ingress**: rules for traffic from *outside*: "requests for `api.<domain>` go to Service `api`". An **ingress controller** (Traefik in k3s) implements them and terminates TLS.

**CronJob**: runs a Pod on a schedule (`* * * * *` = every minute) until it finishes. Settings we use: `concurrencyPolicy: Forbid` (don't start a new run if the last one is still going) and a deadline so a stuck run is killed.

**Job**: runs a Pod once until success, e.g. database migrations before a new version starts.

**ConfigMap / Secret**: configuration and sensitive values passed to containers as environment variables or files. Kubernetes Secrets are only base64-encoded, not encrypted by default, so we never write them in git; they're created in the cluster by External Secrets (4.6).

**ServiceAccount**: an identity for Pods inside Kubernetes, which we map to AWS permissions (5.2).

**Namespace**: a folder for objects (`kinetiq`, `argocd`, `cert-manager`), used to group and scope permissions and policies.

**PodDisruptionBudget**: "never voluntarily take down more than 1 api Pod at a time".

**HorizontalPodAutoscaler (HPA)**: adds or removes replicas based on a metric, e.g. CPU above 70%.

**`kubectl`** is how you inspect and debug: `kubectl get pods` (what's running), `kubectl describe pod X` (events: why it won't start), `kubectl logs X` (its output), `kubectl exec` (a shell inside it). Debugging a Pod stuck in `CrashLoopBackOff` or `ImagePullBackOff` is a skill you'll practise on purpose in Phase 1.

## 4.5 Helm: packaging the YAML

Kinetiq needs dozens of YAML objects, and they differ slightly per environment: LocalStack locally but real SQS and S3 in the cloud, 1 api replica in CI but 2 in production, different image tags. Copying YAML per environment drifts.

**Helm** is the package manager for Kubernetes. A **chart** is a folder of YAML **templates** with placeholders, plus `values.yaml` defaults:

```yaml
# template
replicas: {{ .Values.api.replicas }}
image: "{{ .Values.image.registry }}/kinetiq-api:{{ .Values.image.tag }}"
```

Each environment has a small values file (`local`, `ci`, `prod`) overriding only what differs. `helm template` renders final YAML (handy for checking); `helm install/upgrade` applies it. Third-party software (cert-manager, KEDA, Argo CD) is also installed from published charts. **kubeconform** validates rendered YAML against Kubernetes schemas in CI, so typos fail the build, not the deploy.

## 4.6 The cluster add-ons

Extra components that run in the cluster to provide platform features:

- **Traefik** (built into k3s): the ingress controller, the front door for HTTP/HTTPS and WebSocket traffic. Also applies per-IP rate limits.
- **cert-manager**: obtains free TLS certificates from Let's Encrypt and renews them before they expire (90-day lifetime). Proves we own the domain by answering an HTTP challenge through Traefik.
- **KEDA** (Kubernetes Event-Driven Autoscaling): scales a Deployment on external signals. Ours: "for every 100 messages waiting in the SQS queue, run one more ingest Pod, between 1 and 5". Smarter than CPU-based scaling for a queue worker: the signal is *work waiting*.
- **External Secrets Operator**: reads secrets from AWS Parameter Store and creates Kubernetes Secrets from them, keeping them in sync. Git only contains *references* ("the parameter named /kinetiq/devices/mill-01/key"), never values.
- **CloudNativePG**: the Postgres operator (3.6). Runs the database, its backups and restores.
- **Grafana Alloy**: an agent that collects logs, metrics and traces from the cluster and sends them to Grafana Cloud (Part 5.6).
- **NetworkPolicies** (enforced by k3s): firewall rules between Pods. We start with **default-deny** (no Pod may talk to any other) and then allow only what's needed: Traefik → api, api → analytics-api, everything → database and AWS. If one Pod is compromised, it can't freely explore the cluster.

## 4.7 GitOps with Argo CD

**The problem.** Something has to apply the Helm chart to the cluster on every release. The obvious way is to let CI run `helm upgrade` against the cluster. Downsides: CI needs powerful cluster credentials (a juicy target), and if someone changes the cluster by hand, nothing notices that it no longer matches git.

**GitOps** flips it: the cluster *pulls* its desired state from git.
- **Argo CD** runs inside the cluster and watches the `deploy/` folder on `main`.
- When git changes, Argo CD applies the difference (**sync**). If someone changes the cluster by hand, Argo CD reports it as **OutOfSync** and can revert it (**self-heal**).
- CI's job ends at "build image, push it, commit the new tag into `deploy/environments/prod/values.yaml`". CI never touches the cluster.
- **Rollback** = `git revert` that commit. The git history *is* the deployment history.
- **App of apps**: one root Argo CD Application points at a folder of other Applications (platform add-ons, Kinetiq), so one bootstrap step installs everything.
- **Sync hooks**: the database migration Job runs as a **PreSync** hook, before the new app version rolls out; if migrations fail, the rollout doesn't happen.

Argo CD's web UI shows every object, its health and its sync state: a great screenshot for the README. It isn't exposed to the internet; you reach it through a secure tunnel (5.1).

## 4.8 The disposable server

"Cattle, not pets": a **pet** server is hand-configured and precious, so if it dies you panic. **Cattle** are interchangeable and recreated automatically.

Our setup:
- The server is created from code, never by hand: AWS CDK in hosting variant A, Terraform in variant B (5.4).
- It has a first-boot script (**cloud-init**, called **user data** on AWS) that installs a pinned k3s version, mounts the database's data disk, restores the cluster's signing key (so per-service AWS permissions keep working, 5.2), installs Argo CD and applies the root Application. Argo CD then installs everything else from git.
- Nothing important lives only on the server's own disk: the database is on its separate volume *and* backed up to S3, models are in S3, secrets in Parameter Store, in-flight messages in SQS.
- Variant A only: the server lives in an **Auto Scaling group** with exactly 1 instance. If it fails a health check or Spot reclaims it, AWS launches a replacement automatically. A fixed public IP (**Elastic IP**) is reattached so the domain's DNS record never changes.

**Spot, explained (variant A).** AWS sells its unused capacity as **Spot** instances at roughly 60-70% off, with one condition: it can take the server back with a 2-minute warning. For most production apps that's scary. For us it's fine, because the server is cattle: on the warning, k3s stops containers cleanly and Postgres shuts down safely; the Auto Scaling group starts a new server; the bootstrap reattaches the data disk; Argo CD redeploys; readings waited in SQS. Every Spot interruption is a free, real test of your recovery design. That's a great story to tell.

The **recovery drill**: destroy the server on purpose, time how long until live data shows again, and check no reading was lost. That number goes in the README. Few junior portfolios can show a measured recovery time.

**Limitations.** During replacement (likely 5-15 minutes) the app is down: one server is a **single point of failure**. Kubernetes upgrades and OS patching are ours (we do them by rolling a new server). **Production answer:** three or more nodes across availability zones (or EKS), with database replicas. That goes in the README's limitations.

## 4.9 "Why Kubernetes for 12 machines?" (your interview answer)

Have this ready, in your own words:

> At this scale, serverless would be cheaper; my first plan used Lambda and I've kept the cost comparison. I chose containers on Kubernetes because it gave me one runtime for every service, long-running processes with a fixed database connection pool instead of one connection per function invocation, autoscaling on queue depth with KEDA, and the same Helm chart running on my laptop, in CI and in the cloud. To stay under $20 a month I run a single disposable node and operate Postgres myself with continuous backups; I measured recovery time and documented what real production would need: multiple nodes across availability zones or EKS, and a replicated or managed database.

That answer shows judgement, which is what turns complexity into credibility.

---

# Part 5. Cloud plumbing

## 5.0 The two hosting variants (decided before Phase 2)

The application, the Helm chart and the AWS managed services (IoT Core, SQS, Cognito, S3, SES) are identical in both. Only the server that runs Kubernetes differs:

- **Variant A, all AWS (~$15-18/month):** an EC2 Spot server in an Auto Scaling group. Everything on your CV says AWS. New-account AWS credits probably cover the first months.
- **Variant B, Hetzner + AWS (~$7-10/month):** a server from Hetzner, a long-established German hosting company that rents plain servers cheaply but has no managed services. AWS is still used for the managed services. You also learn Terraform.

Kubernetes is the reason switching later is cheap: the app doesn't know or care whose server it runs on. Full comparison in plan Section 9.

## 5.1 Networking: firewalls, public and private

Whatever the provider, the rules are the same:
- **Firewall** (AWS: **security group**; Hetzner: Hetzner Firewall): the server accepts inbound traffic only on 80 and 443 (web). No SSH port, and the Kubernetes API port isn't open.
- **Postgres has no public address at all.** It's reachable only inside the cluster, and a NetworkPolicy (4.6) allows only our service containers.
- The server makes *outgoing* connections freely (to pull images, reach AWS services, send backups to S3).

AWS-specific terms (variant A):
- **VPC (Virtual Private Cloud)**: your own private network inside AWS. **Subnets** divide it: a **public subnet** has a route to the internet; a **private subnet** doesn't. Our server sits in a public subnet with a strict security group.
- **Why no NAT.** Things in private subnets need a **NAT** for outgoing internet calls; AWS's managed NAT Gateway costs ~$35-40/month, and CDK creates one *by default* unless you tell it not to. We set `natGateways: 0` and a test checks it. That's a classic surprise bill.
- The data disk (an **EBS volume**) can only attach to a server in the same **Availability Zone**, so variant A runs in one zone.
- **Public IPv4 addresses** cost about $3.65/month each on AWS since 2024. We use one **Elastic IP**, which stays the same across server replacements. (Hetzner includes the IPv4 address in the server price.)

**Getting in as an admin without SSH.**
- Variant A: **AWS Systems Manager Session Manager** gives a shell and port forwarding (to `kubectl` or the Argo CD UI) through AWS, authenticated with IAM, with no open ports.
- Variant B: a private **VPN** tunnel (**WireGuard**, or **Tailscale**, which builds on it and is free for personal use) connects your laptop to the server as if they were on the same private network, again with no public admin ports.

## 5.2 IAM: who may do what in AWS

Every AWS request is made by a **principal** (user, role) and checked against **policies**: JSON saying `Allow` (or `Deny`) for **actions** (`sqs:ReceiveMessage`) on **resources** (a specific queue's **ARN**, Amazon's ID format).

- A **role** is an identity something *assumes* temporarily, receiving short-lived credentials.
- **Least privilege**: each piece gets only what it needs, so a bug or breach can't spread. Tests assert no policy allows write actions on `*` (everything).
- **You** won't use the root account day to day. You'll use an **IAM Identity Center** user with short-lived credentials.

**How Pods get AWS permissions: IRSA.** The ingest container must read from SQS; the scorer must write to S3; neither should be able to do the other's job. The tempting shortcut, putting AWS access keys in a Kubernetes Secret, creates long-lived keys that work forever if leaked. Instead we use **IRSA** (IAM Roles for Service Accounts):
1. Every Pod runs under a Kubernetes ServiceAccount (`ingest`, `scorer`, …).
2. Kubernetes signs a short-lived token for that ServiceAccount, like a JWT (3.9) that says "I'm the `ingest` ServiceAccount of the Kinetiq cluster".
3. We publish the cluster's *public* signing keys in an S3 bucket and tell AWS IAM to trust tokens signed by them (an **OIDC provider**, the same mechanism as GitHub → AWS in 5.5).
4. The AWS SDK inside the container exchanges the token for 1-hour credentials of a role made just for that service (`kinetiq-ingest` may only receive and delete messages on the telemetry queue).

EKS sets this up for you; on k3s we wire it ourselves, which teaches how it actually works. It also works from any cloud, so variant B (Hetzner) uses it too. The signing key is stored safely and restored on every server rebuild; otherwise every token would become invalid when the server is replaced.

Variant A extra: an EC2 server also has an **instance role**, whose credentials any program on the server could fetch from the **instance metadata service (IMDS)**, a special local address. We give that role almost nothing and set the IMDS **hop limit** to 1, which blocks containers from reaching it, so Pods can only use their own IRSA role.

## 5.3 Secrets

A **secret** is anything that grants access: passwords, private keys, API keys.
- Never in git (add to `.gitignore` before the file exists), frontend code, logs, Helm values or Dockerfiles.
- Cloud-side secrets (device private keys, the demo account passwords) are stored in **AWS Systems Manager Parameter Store** as encrypted `SecureString` parameters, free at our scale, and synced into the cluster by External Secrets. **Secrets Manager** is AWS's dedicated, paid alternative (~$0.40 per secret per month) with automatic rotation; the README names it as the upgrade.
- Database passwords are generated inside the cluster by CloudNativePG and never leave it (3.6).
- Prefer having no secret at all: IRSA and GitHub OIDC remove whole categories of keys.

## 5.4 Infrastructure as code: AWS CDK

Instead of clicking in the AWS console (unrepeatable, undocumented), we describe AWS resources in TypeScript:

```ts
const queue = new sqs.Queue(this, 'TelemetryQueue', {
  deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
})
```

- **CDK** turns code into a **CloudFormation** template (`cdk synth`), AWS's native deployment format.
- `cdk diff` shows what would change; `cdk deploy` makes AWS match. Deleting code deletes resources (buckets holding backups are protected).
- `cdk bootstrap` is a one-time setup per account and region.
- A **stack** is a group of resources deployed together. We use two or three, because many stacks create cross-stack references that CloudFormation makes hard to change later.
- **cdk-nag** checks security best practices; our tests assert our own rules (no NAT Gateway, every queue has a DLQ).

**Terraform (variant B).** CDK only manages AWS. For the Hetzner server we use **Terraform**, the most widely used infrastructure-as-code tool, which works with almost every provider through **providers** (plugins). You write `.tf` files describing resources; `terraform plan` shows the changes (like `cdk diff`); `terraform apply` makes them. Terraform remembers what it created in a **state file**, which we keep in an S3 bucket, never in git (it can contain sensitive values).

**Division of labour:** CDK (and Terraform in variant B) create things *outside* the cluster: the server, queues, IoT, Cognito, buckets, permissions. Helm + Argo CD manage what runs *inside* the cluster, including Postgres.

## 5.5 CI/CD with GitHub Actions and OIDC

**CI (Continuous Integration)**: every push runs lint, type checks, all tests, image builds and a full deployment into a throwaway k3d cluster inside the CI machine. If the chart is broken, the pull request fails, not production.

**CD (Continuous Delivery/Deployment)**: on merge to `main`, CI builds and pushes images, bumps the tag in git, Argo CD deploys, then CI runs smoke tests and Playwright against production.

**Infrastructure changes** (CDK) are deployed by CI only after you click "approve" in GitHub (a protected **environment**), because they can delete things or cost money.

**OIDC instead of stored keys.** GitHub issues a signed token per workflow run saying "this is repo Saandu/kinetiq, branch main"; AWS trusts exactly that and exchanges it for 1-hour credentials. No long-lived keys to leak. Same idea as your Firebase Workload Identity Federation.

## 5.6 Observability: logs, metrics, traces, alerts

You can't attach a debugger to production. You learn what's happening from:

- **Logs**: one JSON line per event to standard output (`{"level":"error","requestId":"…","msg":"insert failed"}`). Kubernetes captures container output; Alloy ships it to **Loki** (log storage) in Grafana Cloud, where you search it.
- **Metrics**: numbers over time. Each service exposes `/metrics` in **Prometheus** format (the standard for Kubernetes); Alloy scrapes them. **p95** latency = 95% of requests were faster than this, revealing the slow tail that averages hide.
- **Traces** (**OpenTelemetry**, the vendor-neutral standard): one request's journey across services with timings, showing *where* time went. Stored in **Tempo**.
- **Dashboards and alerts** in **Grafana**: rules like "ingest lag p95 > 60 s for 5 minutes" email you. AWS-managed parts (DLQ depth, IoT message count, budget) alert from **CloudWatch**, AWS's own monitoring. Backup health ("last successful backup more than 26 hours ago") is an alert too: backups fail silently unless someone watches them.
- **Runbook**: for each alert, what it means and exact steps to fix.

**Why Grafana Cloud** instead of running Prometheus and Grafana in our cluster: they'd need ~1.5-2 GB of our 4 GB server. The free tier covers this project's volume (check its current limits). The skills are identical; only where the data is stored differs.

## 5.7 Cost control

- **AWS Budgets** email you at 50/80/100% of $20. Created *first*, before anything that costs money.
- A budget alert does **not** stop spending; it only notifies. So we also: cap replicas, avoid expensive defaults (the NAT Gateway trap), rate-limit the simulator, alarm on IoT message count, use no long-lived keys (leaked keys are the classic way people get a surprise bill from crypto-miners), and, in variant A, a budget *action* stops the server at 150% of budget.
- **Cost Explorer** (AWS) and the Hetzner console show actual spend; the 30-day real number goes in `docs/COSTS.md`.
- Every expected cost, including easy-to-miss ones (VAT, currency conversion, domain renewal prices), is listed in plan Section 20.

---

# Part 6. Testing, layer by layer

| Kind | What it proves | Speed | Tools |
|---|---|---|---|
| **Unit** | One function's logic (z-score maths, a store's state) | Milliseconds | Vitest, pytest |
| **Integration** | Pieces work with real dependencies (SQL runs, RLS blocks, the queue consumer handles duplicates) | Seconds | **Testcontainers**: starts real Postgres/LocalStack in Docker for the test, then removes it |
| **Contract** | Two sides agree on shapes (Zod and Pydantic accept/reject the same examples) | Fast | Shared fixtures |
| **Container** | Images build, run as non-root, have no serious known vulnerabilities | Seconds | hadolint, Trivy |
| **Kubernetes** | The chart renders valid YAML that fits the node and the database connection budget | Fast | helm lint, kubeconform, our own tests |
| **Backup and restore** | A backup can actually be restored, with the data intact | Minutes | k3d job in CI; monthly restore CronJob in production |
| **Infrastructure** | CDK (and Terraform) produce what we intend | Fast, no cloud | CDK assertions, cdk-nag, `terraform validate` |
| **End to end** | A real user journey works on a real deployment | Minutes | Playwright, against a CI k3d cluster and against production |
| **Load** | How much traffic before it slows or breaks, and where | Minutes, costs a little | k6 |
| **Resilience** | The system recovers from failures without losing data | Minutes | Scripted drills: kill a Pod, kill the server, pause the database |

Why real Postgres instead of mocks: a mock can't tell you your RLS policy has a hole or your SQL has a typo. Integration tests catch the bugs that matter in a backend.

---

# Part 7. How we'll work, and what to learn first

## 7.1 Order of learning matches order of building

| Phase | You'll learn | Hands-on |
|---|---|---|
| 0a | Monorepo, async data seam | Move the app to `apps/web`, make `TelemetrySource` return Promises |
| 0b | Docker basics | Write your first Dockerfile, build it, run it, look inside it, shrink it with multi-stage |
| 0c | SQL, migrations, Postgres in Docker | Create tables, query them by hand with `psql` |
| 0d | MQTT, queues, idempotency | Publish/subscribe with a CLI; send the same message twice and see one row |
| 0e | Writing an API | Fastify routes reading real rows; point the Vue app at it; `curl` it |
| 0f | docker compose | The whole system with one command |
| 1a | Kubernetes objects, kubectl | k3d cluster; deploy the api by hand with raw YAML; break it and debug it |
| 1b | Helm | Turn the YAML into a chart with values per environment |
| 1c | Probes, resources, NetworkPolicies, KEDA | Watch rolling updates, OOM kills and autoscaling happen |
| 1d | Operators, CloudNativePG, backups | Run Postgres in the cluster, back it up, delete it, restore it |
| 1e | CI | Images, chart checks and a k3d smoke test on every push |
| 1f | GitOps | Argo CD locally; deploy by committing; roll back by reverting |
| 2 | Cloud: IAM, IRSA, CDK (and Terraform in variant B), IoT Core, SQS, S3, the server | Choose the hosting variant, budget alert first, then the same system in the cloud |
| 3 | Python, pandas, scikit-learn | Analytics in a notebook first, then as a service and CronJobs |
| 4 | Auth, roles, RLS, WebSockets, Device Shadow | Two browsers, two roles, live changes |
| 5 | Observability, load and resilience testing | Dashboards, alerts, k6, the recovery drill, a point-in-time restore |

Phases 0 and 1 cost nothing and are where most concepts click. The cloud then becomes "the same things, on a rented server and managed services".

## 7.2 How I'll help in each step

For every step I'll:
1. Explain what we're about to build and why, before writing code.
2. Build it in small commits with you, explaining each file the first time a concept appears.
3. Give you something to try by hand (a SQL query, an MQTT publish, a `curl`, a `kubectl describe`, breaking something on purpose) so you see it work *and* fail.
4. End with **check-your-understanding** questions, the kind an interviewer asks.

Try these now; it's fine not to know yet:
- Why does the telemetry insert use `ON CONFLICT DO NOTHING`? What would happen without it?
- What's the difference between a `401` and a `403`?
- Why can't a user edit their JWT to become an admin?
- Why do we use the median and MAD instead of the mean and standard deviation?
- What's the difference between a Docker image and a container?
- What's the difference between a liveness and a readiness probe, and why must the liveness probe not check the database?
- In GitOps, how do you roll back a bad release?
- Our server dies at 3 a.m. Walk through what happens, step by step, and why no sensor readings are lost.
- What are RPO and RTO, and what are ours?
- Why is a backup that has never been restored not really a backup?

---

# Glossary

| Term | Meaning |
|---|---|
| **API** | The set of requests a server answers, with exact shapes |
| **ARN** | Amazon Resource Name, the unique ID of any AWS resource |
| **Argo CD** | GitOps tool that keeps a Kubernetes cluster equal to what git says |
| **arm64 / amd64** | CPU architectures (Graviton and Apple Silicon / Intel and AMD) |
| **At-least-once** | Delivery where nothing is lost but duplicates can happen |
| **Auto Scaling group** | AWS feature that keeps N servers running, replacing failed ones |
| **Availability Zone** | An independent data centre within a region |
| **Back-pressure** | Letting the slowest component set the pace, with a buffer in front |
| **Broker** | MQTT server routing messages from publishers to subscribers |
| **CDK** | AWS Cloud Development Kit: AWS infrastructure written in TypeScript |
| **cert-manager** | Kubernetes add-on that obtains and renews TLS certificates |
| **CI/CD** | Automatic testing on every change / automatic delivery to production |
| **CloudFormation** | AWS's native deployment engine; CDK generates its templates |
| **CloudWatch** | AWS's monitoring service |
| **CloudNativePG** | Kubernetes operator that runs PostgreSQL, its backups and restores |
| **cloud-init / user data** | Script a new server runs on first boot |
| **Cognito** | AWS's user sign-in service |
| **Connection pool** | A fixed set of reusable database connections inside a long-running program |
| **Container / image / registry** | A running packaged app / the package / where packages are stored |
| **Control plane / node** | Kubernetes' brain / a machine that runs containers |
| **CronJob / Job** | Kubernetes object that runs a Pod on a schedule / once |
| **Deployment** | Kubernetes object that keeps N identical Pods running and rolls out updates |
| **Device Shadow** | Desired vs reported device state document in IoT Core |
| **DLQ** | Dead-letter queue, where messages go after repeated failure |
| **Dockerfile / multi-stage** | Image build recipe / one that builds in one stage and ships a slim final stage |
| **docker compose** | Tool to run several containers together from one YAML file |
| **EBS volume** | AWS network disk attached to an EC2 server; survives the server being replaced |
| **EC2** | AWS virtual servers |
| **ECR / GHCR** | AWS's / GitHub's container registry |
| **EKS** | AWS's managed Kubernetes |
| **Elastic IP** | A fixed public IP address you can move between servers |
| **External Secrets Operator** | Syncs secrets from a cloud secret store into Kubernetes |
| **GitOps** | Git is the source of truth; the cluster pulls and applies it |
| **Grafana / Loki / Tempo / Prometheus** | Dashboards and alerts / log store / trace store / metrics format and system |
| **Grafana Alloy** | Agent that collects logs, metrics and traces and forwards them |
| **Hetzner** | German hosting provider renting plain servers cheaply (hosting variant B) |
| **Helm / chart / values** | Kubernetes package manager / a package of templates / per-environment settings |
| **HPA** | Horizontal Pod Autoscaler: changes replica count based on metrics |
| **IAM** | AWS permission system: principals, roles, policies |
| **Idempotent** | Doing it twice has the same effect as once |
| **IMDS** | Instance metadata service, where code on an EC2 server gets its credentials |
| **Index** | Database lookup structure that makes queries fast |
| **Ingress / ingress controller** | Rules for outside traffic into the cluster / the software that applies them (Traefik) |
| **IoT Core** | AWS's managed MQTT broker and device registry |
| **IRSA** | IAM Roles for Service Accounts: per-Pod AWS permissions |
| **JWT** | Signed token carrying user identity and claims |
| **k3s / k3d** | Lightweight certified Kubernetes / k3s running inside Docker |
| **KEDA** | Event-driven autoscaler (we scale on SQS queue depth) |
| **kubectl** | Command-line tool to inspect and control Kubernetes |
| **Lambda** | AWS serverless functions (considered, not used) |
| **LISTEN / NOTIFY** | Postgres' built-in publish/subscribe between connections |
| **LocalStack** | Local imitation of AWS services for development and tests |
| **Liveness / readiness probe** | "Restart me if this fails" / "send me traffic only if this passes" |
| **MAD** | Median absolute deviation, a robust measure of spread |
| **Migration** | Versioned schema change file |
| **MQTT** | Lightweight publish/subscribe protocol for devices |
| **Namespace** | A folder for Kubernetes objects |
| **NAT** | Lets private resources make outgoing internet connections |
| **NetworkPolicy** | Firewall rules between Pods |
| **OIDC** | Standard for proving identity with signed tokens (GitHub → AWS, IRSA) |
| **Operator** | Software running in Kubernetes that automates what a human administrator would do for a specific system |
| **Parameter Store** | AWS Systems Manager's free store for configuration and encrypted secrets |
| **Point-in-time recovery** | Restoring a database to any chosen moment from a base backup plus archived WAL |
| **OOMKilled** | Container killed for exceeding its memory limit |
| **OpenAPI** | Machine-readable description of an HTTP API |
| **OpenTelemetry** | Vendor-neutral standard for traces, metrics and logs |
| **p95** | 95th percentile: 95% of measurements are below this value |
| **Partitioning** | Splitting a large table into smaller physical tables by range |
| **PKCE** | Secure sign-in flow for apps that can't keep a secret |
| **Pod** | Smallest Kubernetes unit: one or more containers running together |
| **Port** | A numbered network door on a computer |
| **Precision / recall** | Share of alerts that were real / share of real faults caught |
| **QoS** | MQTT delivery guarantee level |
| **RDS** | AWS-managed relational databases (the budget-permitting alternative to CloudNativePG) |
| **RPO / RTO** | How much data you can lose / how long recovery takes |
| **Reconciliation** | Continuously comparing desired and actual state and fixing the difference |
| **Region** | Geographic AWS location, e.g. eu-central-1 Frankfurt |
| **Replica** | One of several identical copies of a service |
| **Requests / limits** | CPU and memory reserved for / capped for a container |
| **RLS** | Row Level Security, database-enforced row filtering |
| **Rolling update** | Replacing Pods one by one so there's no downtime |
| **S3** | AWS file/object storage |
| **Security group** | AWS firewall around a resource |
| **Service** | Stable internal address for a set of Pods |
| **SES** | AWS email sending service |
| **Single point of failure** | One component whose failure stops the whole system |
| **Spot instance** | Discounted spare AWS capacity that can be reclaimed with 2 minutes' notice |
| **SQS** | AWS message queue service |
| **Terraform / state** | Multi-provider infrastructure-as-code tool / its record of what it created |
| **SSM Session Manager** | Shell and port-forward access to servers through AWS, without SSH |
| **Subnet (public/private)** | Part of a VPC with / without a direct internet route |
| **TLS / mutual TLS** | Encryption with server identity / with both sides proving identity |
| **Topic** | MQTT address that messages are published to |
| **Traefik** | Ingress controller bundled with k3s |
| **Transaction** | Group of database statements that succeed or fail together |
| **Trivy / hadolint** | Image vulnerability scanner / Dockerfile linter |
| **Visibility timeout** | How long an SQS message stays hidden while a worker processes it |
| **WAL** | Postgres' write-ahead log: every change, recorded before it's applied |
| **WireGuard / Tailscale** | Private VPN tunnel / a free-for-personal-use service built on it |
| **VPC** | Your private network inside AWS |
| **WebSocket** | Long-lived connection that lets the server push messages |
| **X.509 certificate** | Standard digital identity document used in TLS |
| **XSS** | Cross-site scripting: an attacker's JavaScript running in your page |
| **Zod / Pydantic** | Runtime data validation for TypeScript / Python |

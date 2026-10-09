# Phase 1: local Kubernetes implementation order

Phase 0 delivers twelve fictional devices through MQTT, SQS, PostgreSQL and the
same-origin read API into the dashboard. Its latest checkpoint is `2c9758f`.
The public Firebase deployment continues using browser-local simulation.
The full production-plan scope remains in force. This phase provisions only
local containers; cloud identity and paid infrastructure belong to Phase 2.

## Small commits and their gates

1. **Make the existing broker restart safely.** Update
   `infra/local/start-mosquitto.sh`, add a real-container restart regression in
   `packages/pipeline-tests/tests/broker-restart.test.ts`, and extend the local
   lesson. Verify repeated starts, authentication and retained messages, then
   run the existing package, image and Compose gates before committing.
2. **Establish the local cluster and pinned tools.** Add a k3d configuration,
   checked tool setup and cluster lifecycle scripts under `infra/k8s/local/`
   and `scripts/`. Keep downloads, kubeconfigs and generated credentials on D:
   and Git-ignored. Verify the k3d/k3s pairing and operator support matrices;
   record the tested versions in `STACK_VERSIONS.md`. Start/stop the disposable
   cluster, inspect nodes, import service images and measure its memory use.
3. **Package the application with Helm.** Add `infra/helm/kinetiq/` with local
   and CI values, Deployments, Services, configuration, setup Jobs, probes,
   resource budgets, restricted security contexts and NetworkPolicies. Reuse
   the current service images and contracts. Add render/lint/schema validation
   scripts and checks; ensure secrets do not appear in tracked values.
4. **Run PostgreSQL with CloudNativePG.** Add the compatible database image
   and operator configuration, then exercise migrations, tenancy and partitions
   against the operator-managed database. Add LocalStack S3 backup configuration
   and a restore drill into a separate database. Test retained-volume recovery
   separately; prove S3 recovery independently rather than assuming a PVC name
   guarantees recovery. Document observed recovery behavior and limitations.
5. **Run the whole data path and scaling.** Wire local MQTT, LocalStack, ingest,
   API and web into the cluster. Extend acceptance to compare API metrics to
   database rows. Install KEDA and demonstrate queue-depth scaling under a
   bounded load; twelve normal devices need not trigger scaling.
6. **Practice GitOps and gate it in CI.** Add local Argo CD configuration and
   documented branch-based reconciliation. Extend `.github/workflows/verify.yml`
   with pinned image/lint/render checks and disposable k3d smoke and restore
   jobs. Verify the successful terminal results before calling Phase 1 done.

## Learn by inspecting

A Pod runs a container; a Deployment maintains the requested number of Pods.
A Service gives changing Pods a stable address. A Helm chart renders those
objects from environment-specific values. An operator maintains a more complex
resource, such as a PostgreSQL cluster. Argo CD compares Git with the cluster
and reconciles differences. Each is introduced in a lesson when implemented.

Before increasing the infrastructure, reproduce failure and recovery on the
existing local application. A clean first start alone cannot prove restart
safety, persistent data recovery or backup restoration.

## Progress

The broker restart fix and regression test are implemented. On 8 October 2026,
lint, every workspace build and type check, all 125 package tests and six real
transport tests passed with Node 24.21.0 and npm 11.19.0. The transport suite
includes authenticated retained-message delivery after two broker restarts.
All four Node production images built and passed non-root/import smoke checks;
the production dependency audit reported zero vulnerabilities.
Compose acceptance passed after a broker restart and now requires readings
from all twelve devices to be at most two minutes old. The local emulator's
queue recreation and unhealthy-worker recovery are documented in the lesson.

The audit also identified `source-map-js` 1.2.1; its lockfile entry is updated
to the patched 1.2.2 release. No unrelated packages were upgraded.

The local cluster foundation is implemented on 9 October 2026. Checksum-verified
k3d 5.9.0, kubectl 1.36.5 and Helm 4.3.0 are installed under ignored `.tools/k8s`
on D:. k3s 1.36.5 is pinned by digest and selected against the CloudNativePG,
KEDA and Helm support matrices. The single node and all four system Deployments
passed readiness checks before and after a stop/start cycle. All six application
images were imported and remained present after restart. The default kubeconfig
remained absent; API and future ingress bindings are loopback-only.

Observed server memory was 623–810 MiB, plus about 16 MiB for the k3d proxy.
The configured node cap is 8 GiB, but this Docker WSL VM currently provides only
6.7 GiB total. On this 16 GB laptop, keep the allocation and run Compose and
Kubernetes separately; use measured full-stack results to choose a dedicated
verification session, CI or another machine if necessary. These are
foundation observations, not a full-stack memory or availability result.
Application Helm objects and operators are the next steps. No cloud resources
have been created. See [the cluster lesson](lessons/PHASE_1_CLUSTER.md).

This checkpoint also passed the database image build, lint, all workspace builds
and type checks, 125 package tests, six transport tests and Compose acceptance.
All four Node images passed production import and non-root identity checks.
At the foundation checkpoint, Helm could query the local system releases.
Application chart checks are implemented in the checkpoint below.

The application chart is now implemented under `infra/helm/kinetiq`, with local
and CI profiles, five Deployments, two setup Jobs, existing Secret references,
Services, configuration, ingress and eleven NetworkPolicies. Both profiles render
36 objects and pass strict Kubernetes 1.36.5 schemas with no skipped resources.
Seventeen unsafe-change regression checks cover credential exposure, public ports,
security, policies, values and memory. The real non-root web image accepts the
rendered Nginx configuration, including Kubernetes DNS discovery.

Steady application memory limits are 832 MiB locally and 1,088 MiB in the CI
profile. Including simultaneous rolling surges and both setup Jobs, the totals
are 1,920 and 2,176 MiB. These are configured budgets, excluding the database,
emulators, operators and Kubernetes. No full-stack memory measurement or network
policy enforcement result is claimed. The simulator and bridge use Recreate
updates to avoid overlapping fixed MQTT client IDs. Kubernetes remains stopped
during this chart checkpoint's Compose-based checks.

The chart deliberately requires the subsequent CloudNativePG/platform steps
before installation. Database/queue Jobs have not yet run under Kubernetes;
Argo CD sync ordering and Linux CI installation belong to their later steps.
See [the Helm lesson](lessons/PHASE_1_HELM.md).

Chart checkpoint verification on 9 October 2026 also passed all 125 package
tests and six transport tests, lint/build/type checks, the PostgreSQL image,
all four Node image import/non-root checks, Compose acceptance and the production
dependency audit (zero reported vulnerabilities). New JavaScript scripts passed
ESLint and syntax checks. No chart was installed and no cloud changes were made.

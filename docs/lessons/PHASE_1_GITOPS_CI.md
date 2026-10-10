# Phase 1: GitOps and disposable Kubernetes CI

## What changes

Previously `k8s:app` ran Helm directly. Now a committed chart defines the desired
application state. Argo CD reads it, renders it, applies it and checks health.
Changing a running Deployment by hand creates **drift**. Self-heal restores Git's
version. Publishing a new committed branch snapshot changes what Argo wants.

Think of Helm as the renderer and Argo as the controller that repeatedly compares
the rendered result with the cluster. Argo uses `helm template`, not Helm release
upgrades. Consequently a Helm revision counter is not a deployment history under
Argo; the Application records the actual Git SHA instead.

Our drift check changes the existing `checksum/config` field that Git owns.
Three-way apply can preserve unrelated extra annotations created by another tool,
so adding a new annotation is not proof of managed-field drift repair. A commit
that changes only documentation also need not roll out workloads or rerun hooks.

## How the local setup works

`scripts/setup-k8s-gitops.mjs` verifies an upstream Core manifest checksum, pins
its container digests and installs controller, repo server and Redis. We omit the
unused ApplicationSet controller. Core has no public web server. The steady
container memory limits are 896 MiB plus 64 MiB for the Git mirror; limits are
ceilings, not measured usage. Bootstrap remains a separate administrator step.

`scripts/publish-k8s-git.mjs` makes a bare clone of the committed branch, copies
that repository into an internal read-only Git daemon Pod. An
atomic symlink switch publishes it only after copying completes. This is real Git
history, not a copy of the working directory. Ignored credentials and uncommitted
edits are excluded. Argo's network rules permit the internal mirror and Kubernetes
services, not arbitrary external destinations. No GitHub credential is needed.

The AppProject permits only application Deployments, Jobs, ConfigMaps, Services,
ServiceAccounts, Ingress and NetworkPolicies in `kinetiq-local`. Argo cannot prune
database volumes, credential Secrets, namespaces or CloudNativePG resources
through this project. This boundary constrains Application manifests; the trusted
bootstrap administrator still has the permissions needed to install operators.
Ownership explicitly uses Argo's tracking annotation. Platform Pods share
application routing labels, so treating that label as ownership could incorrectly
adopt and prune the broker or emulator Deployment. Runtime verification checks
that those Deployments and the Git mirror remain outside the Application.

## Why migration ordering needs care

**PreSync** runs before ordinary resources are applied. On a fresh install the
application ConfigMaps and its `postgres` alias do not exist. Each hook therefore
contains its own version's migration/queue script. The migration connects directly
to CloudNativePG's existing service, verifying the mounted public CA certificate.
Bootstrap supplies the stable hook service accounts and restrictive network rules;
the chart adopts those objects during Sync. It never copies credential values.

Both hooks must succeed before workload Sync. A failed migration leaves existing
Pods serving the earlier version. This only works with **expand/contract**:
first add a compatible schema, deploy code that can use it, and remove obsolete
columns in a later change after older code has stopped using them. Passing a
migration test alone cannot prove compatibility with every older application.

Completed hooks are deleted. Their results remain in Application operation
status. Retry limits and Job deadlines prevent indefinite attempts. Selective
resource sync skips hooks; use full Application reconciliation for deployments.

## Two controllers must not own the same field

KEDA/HPA changes `kinetiq-ingest.spec.replicas` between one and three. Argo ignores
only this field and respects that exclusion when applying manifests. It continues
to manage the worker's image, probes, security and other configuration. Ignoring
the whole Deployment would hide real drift; managing replicas would fight KEDA.

## What CI adds

Static Helm, scaling and GitOps checks run without a LocalStack token, including
on pull requests. The pinned CLI installer verifies separate Windows/Linux x64
checksums and installs in the checkout's ignored tool directory.
`npm run docker:lint` runs digest-pinned hadolint against all three Dockerfiles;
health checks use exec-form commands and Node images specify UID/GID 1000.

The Kubernetes job runs on trusted repository pushes or an explicit maintainer workflow
dispatch. It creates a fresh k3d cluster, imports built images, installs operators
and proves S3 recovery onto a separate volume **before** starting the simulator.
Otherwise the source fingerprint would keep changing during the comparison.
It then starts the broker, reconciles the committed chart, checks fresh readings,
proves runtime network/MQTT boundaries, exercises bounded scaling and checks Argo
drift repair. An `always()` cleanup removes the disposable cluster and local
secret files. No cluster credentials or auth token become build artifacts.
Checkout uses the exact triggering SHA, then names that commit locally for the
mirror. A later push to the same branch cannot silently change the tested code.

The fresh runner caught a useful filesystem distinction: a Docker build compiles
contracts **inside the image**, but `setup-k8s-messaging.mjs` imports contracts
**on the host**. `npm ci` links the workspace without building its `dist` exports.
CI therefore builds the host contracts package explicitly before bootstrap. Local
generated files had masked the missing step. Fresh-checkout tests catch this kind
of accidental dependency on yesterday's build.

Actions are pinned to immutable commits for the maintained Node 24 releases.
The runner OS uses the explicit Ubuntu 24.04 family rather than a moving label.
The hosting build is uploaded and downloaded in CI; `verify-ci-artifact.mjs`
compares every relative file path and SHA-256 hash. This checks the real artifact
transport before Firebase delivery. A modified-byte negative check was rejected.

Main's Firebase deployment waits for these gates as well as the existing checks.
Dispatching on a development branch never deploys Firebase. A workflow added
locally is not evidence of a successful GitHub Actions run; record that separately.

## Use and inspect

For the whole local stack in one command, with Docker running, Compose stopped,
the root token configured and repository changes committed:

```powershell
npm run k8s:bootstrap
```

This installs tools, builds host contracts and images, starts the cluster,
imports images, installs operators/database/messaging, configures Argo and KEDA,
restarts application Pods to use the rebuilt development images, then verifies
fresh data. It preserves existing data volumes. The separate `k8s:up` remains
the lightweight cluster-only command used by earlier lessons and CI's ordered
recovery drill. Bootstrap refuses uncommitted repository changes and a running
Compose stack. The recovery drill remains separate so it can run before writes.

After the existing cluster, image, operator, database and messaging prerequisites:

On a fresh checkout, first run `npm run build --workspace @kinetiq/contracts`
before host-side messaging or API verification scripts. Image builds alone do
not provide those host files.

```powershell
npm run k8s:gitops
npm run k8s:gitops:status
npm run k8s:gitops:verify
```

After a new commit on the same branch:

```powershell
npm run k8s:gitops:publish
npm run k8s:gitops:status
```

Do not run `k8s:app` after adoption: it refuses to overwrite Argo's application.
Port 3102 remains the local dashboard. GitOps does not change the public Firebase
demo into a cloud backend. Local mutable image tags remain a development limit;
Phase 2 will use published immutable images and the remote Git repository.
The emulator's S3 is still ephemeral and does not prove host-loss recovery.

## Practice

The verifier requests a full sync before checking the two migration/queue hooks.
Argo records its most recent operation: a later partial drift repair can replace
the earlier full-sync result. Checking that history alone would wrongly report
missing hooks. The full sync exercises their repeatability; the subsequent drift
test exercises self-healing. Pending operations must finish before a prior
`Succeeded` status can count as current evidence.

1. Inspect the Application status and identify the committed SHA, health and
   operation result. Why is `Healthy` alone insufficient evidence of a deployment?
2. Run the drift test and watch the web Deployment return to Git's definition.
   Why is changing a live resource by hand an unreliable permanent fix?
3. Explain why dropping a column in PreSync can break old Pods even if the new
   application starts successfully.
4. Explain why Argo ignores replicas for ingest but still manages the worker image.
5. Compare the local Git mirror with GitHub delivery: which parts are the same,
   and which credentials/images will change in Phase 2?

References: [Argo Core](https://argo-cd.readthedocs.io/en/stable/operator-manual/core/),
[sync phases and waves](https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/),
[diff customisation](https://argo-cd.readthedocs.io/en/stable/user-guide/diffing/).

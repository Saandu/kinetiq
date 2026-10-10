# Supported stack baseline

Checked 5 October 2026. These are selected release baselines, not claims that the planned services are installed or deployed. The complete scope in PRODUCTION_PLAN.md remains unchanged.

Node follows LTS. PostgreSQL follows supported stable majors. Python and most platform tools have no LTS label: use their stable maintained releases. Exclude prereleases. Pin package versions and lockfiles; pin image tags and resolve digests when images are introduced. Upgrade through verified commits, never floating `latest` tags.

| Component | Selected version | Upstream evidence |
|---|---|---|
| Node.js | 24.21.0, LTS | [Release index](https://nodejs.org/dist/index.json), [support schedule](https://github.com/nodejs/Release#release-schedule) |
| npm | 11.19.0, bundled with Node | Node release index above |
| PostgreSQL | 18.6 | [Supported versions](https://www.postgresql.org/support/versioning/); 19 is still prerelease |
| Python | 3.14.8 | [Python downloads](https://www.python.org/downloads/); 3.15 is still prerelease |
| k3s | 1.36.5+k3s1, operator-compatible baseline | [Release](https://github.com/k3s-io/k3s/releases/tag/v1.36.5%2Bk3s1) |
| kubectl | 1.36.5, matches the local server minor | [Official binaries](https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/) |
| k3d | 5.9.0 | [Release](https://github.com/k3d-io/k3d/releases/tag/v5.9.0) |
| Helm | 4.3.0 | [Release](https://github.com/helm/helm/releases/tag/v4.3.0) |
| kubeconform | 0.8.0 | [Release](https://github.com/yannh/kubeconform/releases/tag/v0.8.0) |
| Argo CD | 3.5.3 | [Release](https://github.com/argoproj/argo-cd/releases/tag/v3.5.3) |
| KEDA | 2.21.0 | [Release](https://github.com/kedacore/keda/releases/tag/v2.21.0) |
| External Secrets chart | 2.11.0 | [Release](https://github.com/external-secrets/external-secrets/releases/tag/helm-chart-2.11.0) |
| cert-manager | 1.21.2 | [Release](https://github.com/cert-manager/cert-manager/releases/tag/v1.21.2) |
| CloudNativePG | 1.30.1 | [Release](https://github.com/cloudnative-pg/cloudnative-pg/releases/tag/v1.30.1) |
| Barman Cloud plugin | 0.15.1 | [Release](https://github.com/cloudnative-pg/plugin-barman-cloud/releases/tag/v0.15.1) |
| Grafana Alloy | 1.20.1 | [Release](https://github.com/grafana/alloy/releases/tag/v1.20.1) |
| Terraform | 1.16.5 | [Release](https://github.com/hashicorp/terraform/releases/tag/v1.16.5) |
| AWS CDK | 2.272.0 | [Release](https://github.com/aws/aws-cdk/releases/tag/v2.272.0) |
| Mosquitto | 2.1.2 | [Downloads](https://mosquitto.org/download/) |
| LocalStack | 2026.09.0, maintained unified image | [Image versioning](https://docs.localstack.cloud/aws/customization/other-installations/docker-images/); [account token required](https://docs.localstack.cloud/aws/getting-started/auth-token/), stored locally outside frontend files |
| uv | 0.12.23 | [Release](https://github.com/astral-sh/uv/releases/tag/0.12.23) |
| Firebase CLI | 15.32.1 | [npm package](https://www.npmjs.com/package/firebase-tools) |

Frontend and TypeScript dependencies are checked against the npm registry's stable `latest` tag and locked in the root package-lock.json. `@types/node` must match Node 24, rather than the newest Node major. Backend dependencies receive the same check when their packages are created. Python dependencies are resolved and locked together against Python 3.14 when analytics begins; the ARM wheel availability and test results must be checked then.

Platform versions are not Helm chart versions unless explicitly labelled. During Phase 1, verify the Kubernetes support matrix of every operator and the k3d/k3s pairing, resolve exact chart versions, render and test them together. A newer release alone does not prove compatibility.

## Phase 1 local cluster selection

Rechecked 9 October 2026: k3d 5.9.0 and Helm 4.3.0 remain the selected current
releases. Kubernetes 1.36.5 is the supported intersection of
[CloudNativePG 1.30's matrix](https://cloudnative-pg.io/docs/1.30/supported_releases/),
[KEDA 2.21's tested versions](https://keda.sh/docs/2.21/operate/cluster/) and
[Helm 4.3's support policy](https://helm.sh/docs/topics/version_skew/).
The newer k3s 1.37.1 is therefore not the local baseline. Other operators must
still pass their own chart compatibility and installation checks when introduced.
Windows x64 tool artifacts and their SHA-256 hashes are pinned in
`infra/k8s/local/tools.json`. The k3s image is pinned in the local cluster YAML.

The chart checkpoint adds kubeconform 0.8.0 with a checked Windows archive digest.
Strict Kubernetes 1.36.5 schemas use registry commit
`5f1fa4f7908afc9b6641c62d282a4a22437626e1` in `scripts/verify-helm.mjs`, not a
moving branch. The schema cache stays under ignored `.tools/k8s` on D:.
The existing locked `yaml` 2.9.1 parser is now an explicit development dependency
for chart checks; no runtime application package versions changed.

## Database image compatibility

Installed and exercised on Kubernetes 1.36.5 on 9 October 2026: CloudNativePG
1.30.1 (chart 0.29.1), Barman Cloud 0.15.1 (chart 0.8.1), and cert-manager 1.21.2.
Archive checksums and operator/sidecar image digests are recorded in
`infra/k8s/local/operators.json`. The local installer verifies them and uses
small resource limits; it does not use a moving upstream installation URL.
The tested PostgreSQL image runs as UID/GID 999 under CloudNativePG, with its
extensions and server settings declared in the Cluster rather than relying on
the image's Compose command. See the database recovery lesson for its actual
verification and local-emulator durability boundary.

Use PostgreSQL 18.6 consistently in local development, integration tests and CloudNativePG. The [CloudNativePG image documentation](https://cloudnative-pg.io/docs/1.30/container_images/) and [image repository](https://github.com/cloudnative-pg/postgres-containers) do not establish that an arbitrary stock image has `pg_partman` and `pg_cron` installed. The Phase 0 database image must explicitly provide those extensions, and integration tests must query `pg_available_extensions`, create them and exercise partition maintenance. Do not silently remove the planned partitioning or retention scope to accommodate an image.

## Verification boundary

Frontend/runtime setup and contracts were executable at the beginning of Phase 0. Docker is now available, and the local PostgreSQL image and integration tests are executable. Python checks start when a Python package exists; image builds require Docker; Helm and CDK gates start when their source exists. Missing tools or failed checks must be reported, not treated as passing. Cloud provisioning still requires explicit session confirmation under the plan's working rules.

## Verified local database image

The local messaging checkpoint pins `eclipse-mosquitto:2.1.2-alpine` to `sha256:38c0da4f2ef84284d47b3b3eeea1cb3bdeabe81ee10caf0cd5c5ff61ee3ea408` and `localstack/localstack:2026.09.0` to `sha256:801a3dff7f6a23857e7310b7602e67d52a29dfdcb03e09f7c608d5c57d24b792`. The service Dockerfile pins `node:24.21.0-bookworm-slim` to `sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6`. LocalStack SQS and broker ACL/recovery behavior were tested with the account token on Linux amd64. S3 backup behavior, ARM and cloud IAM remain separate checks.

The local Docker/Testcontainers image uses `postgres:18.6-bookworm` with digest `sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650`. PGDG packages pin `postgresql-18-partman=5.5.0-1.pgdg12+1` and `postgresql-18-cron=1.6.8-1.pgdg12+2`. Image build and installed extension checks passed on this Windows host's Linux amd64 engine. CloudNativePG and ARM compatibility remain Phase 1 checks; do not assume this stock-image entrypoint can be deployed unchanged under the operator.

## Verified TypeScript 7 setup

TypeScript 7.0.2 is the native compiler for shared TypeScript packages and future backend services. The root installs `@typescript/native` as an exact npm alias for that release, and `typescript` as an alias for `@typescript/typescript6` 6.0.2. That compatibility package resolves the maintained TypeScript 6.0.3 API in the lockfile; it exposes `tsc6`, leaving `tsc` to the native compiler.

This follows [Microsoft's documented side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and [Vue language-tools compatibility change](https://github.com/vuejs/language-tools/pull/6123). TypeScript 7.0 does not expose the compiler API used by Vue's template checker and typescript-eslint. `vue-tsc` 3.3.12 handles the compatibility package and preserves full template checks. This is a tooling boundary, not a reason to retain deprecated application patterns or rewrite Vue components. Remove the shim when both tools support the native API.

Verified locally: `tsc --version` reports 7.0.2, `tsc6 --version` reports 6.0.3, native contracts checks/builds and Vue template checks pass. Deprecated `baseUrl` is removed; explicit `paths` resolve relative to the configuration file. CI runs both package checks through `npm run verify`.

## Phase 0 API and web container

On 8 October 2026, the resumed audit identified
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
in the transitive `source-map-js` 1.2.1 dependency. Its existing semver ranges
accept the patched 1.2.2 release, so a targeted update changes only that
lockfile entry. This preserves the selected application versions while removing
the reported indexed-source-map denial-of-service issue.

Fastify 5.12.5, fastify-type-provider-zod 7.0.0, @fastify/swagger 9.9.1 and
openapi-typescript 7.13.0 are exact npm pins checked when the API was introduced.
The generated OpenAPI 3.1 contract is checked during builds. The local web server
uses the maintained unprivileged Nginx stable image (verified `nginx/1.30.5`),
pinned to `sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3`.
Its tag is descriptive; the immutable digest controls the actual image.

## Phase 1 running pipeline and scaler

On 10 October 2026 the full local pipeline runs under k3s. KEDA 2.21.0/chart
2.21.0 is installed from its official chart archive with verified SHA-256;
operator, metrics server and admission webhook images are pinned by digest in
`infra/k8s/local/keda.json`. Certificate management uses the existing cert-manager.
The runtime drill exercises its SQS scaler against the maintained LocalStack
emulator and caps ingest at three workers. Downloads remain on D: under ignored
`.tools/k8s/platform`. This does not establish cloud IAM/IRSA behavior.

## Phase 1 GitOps controller

Argo CD 3.5.4 was verified against the official GitHub latest stable release on
10 October 2026. `infra/k8s/local/argocd.json` pins its Core manifest SHA-256,
Argo container digest and the upstream manifest's Redis 8.2.3-alpine digest.
The local installer omits the unused ApplicationSet controller, limits controller
concurrency and supplies explicit resource limits. The read-only Git daemon
reuses the same pinned Argo image, including its Git executable. Windows/Linux
x64 tool download checksums are recorded separately in `tools.json`.
Sources: [official release](https://github.com/argoproj/argo-cd/releases/tag/v3.5.4)
and [versioned Core manifest](https://github.com/argoproj/argo-cd/blob/v3.5.4/manifests/core-install.yaml).

The workflow pins maintained Node 24 Actions to verified upstream commit SHAs:
checkout 7.0.1, setup-node 7.1.0, upload-artifact 7.0.2, download-artifact 8.0.2
and Google authentication v3. The artifact upload/download combination retains
archived directory delivery and is checked with a byte-for-byte round trip.
The application still runs Node 24.21.0 from `.nvmrc`; an Action's own runtime
and the runtime it installs are separate choices.
Sources: [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1),
[setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0),
[upload-artifact](https://github.com/actions/upload-artifact/releases/tag/v7.0.2),
[download-artifact](https://github.com/actions/download-artifact/releases/tag/v8.0.2).

Dockerfile lint uses hadolint 2.15.1, pinned to image digest
`sha256:32dac94127fd60b7b7e3fbfc65e1383b9b5e25c9bfd7b8536de7a539fe68a12d`.
[Official release](https://github.com/hadolint/hadolint/releases/tag/v2.15.1).

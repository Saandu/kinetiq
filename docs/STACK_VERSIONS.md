# Supported stack baseline

Checked 5 October 2026. These are selected release baselines, not claims that the planned services are installed or deployed. The complete scope in PRODUCTION_PLAN.md remains unchanged.

Node follows LTS. PostgreSQL follows supported stable majors. Python and most platform tools have no LTS label: use their stable maintained releases. Exclude prereleases. Pin package versions and lockfiles; pin image tags and resolve digests when images are introduced. Upgrade through verified commits, never floating `latest` tags.

| Component | Selected version | Upstream evidence |
|---|---|---|
| Node.js | 24.21.0, LTS | [Release index](https://nodejs.org/dist/index.json), [support schedule](https://github.com/nodejs/Release#release-schedule) |
| npm | 11.19.0, bundled with Node | Node release index above |
| PostgreSQL | 18.6 | [Supported versions](https://www.postgresql.org/support/versioning/); 19 is still prerelease |
| Python | 3.14.8 | [Python downloads](https://www.python.org/downloads/); 3.15 is still prerelease |
| k3s | 1.37.1+k3s1 | [Release](https://github.com/k3s-io/k3s/releases/tag/v1.37.1%2Bk3s1) |
| k3d | 5.9.0 | [Release](https://github.com/k3d-io/k3d/releases/tag/v5.9.0) |
| Helm | 4.3.0 | [Release](https://github.com/helm/helm/releases/tag/v4.3.0) |
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
| LocalStack | 4.14.0 tagged community release | [Releases](https://github.com/localstack/localstack/releases); check distribution/auth requirements and SQS/S3 support before Compose integration |
| uv | 0.12.23 | [Release](https://github.com/astral-sh/uv/releases/tag/0.12.23) |
| Firebase CLI | 15.32.1 | [npm package](https://www.npmjs.com/package/firebase-tools) |

Frontend and TypeScript dependencies are checked against the npm registry's stable `latest` tag and locked in the root package-lock.json. `@types/node` must match Node 24, rather than the newest Node major. Backend dependencies receive the same check when their packages are created. Python dependencies are resolved and locked together against Python 3.14 when analytics begins; the ARM wheel availability and test results must be checked then.

Platform versions are not Helm chart versions unless explicitly labelled. During Phase 1, verify the Kubernetes support matrix of every operator and the k3d/k3s pairing, resolve exact chart versions, render and test them together. A newer release alone does not prove compatibility.

## Database image compatibility

Use PostgreSQL 18.6 consistently in local development, integration tests and CloudNativePG. The [CloudNativePG image documentation](https://cloudnative-pg.io/docs/1.30/container_images/) and [image repository](https://github.com/cloudnative-pg/postgres-containers) do not establish that an arbitrary stock image has `pg_partman` and `pg_cron` installed. The Phase 0 database image must explicitly provide those extensions, and integration tests must query `pg_available_extensions`, create them and exercise partition maintenance. Do not silently remove the planned partitioning or retention scope to accommodate an image.

## Verification boundary

Only frontend/runtime setup is executable at the beginning of Phase 0. Python checks start when a Python package exists; image builds require Docker; Helm and CDK gates start when their source exists. Missing tools or failed checks must be reported, not treated as passing. Cloud provisioning still requires explicit session confirmation under the plan's working rules.

## Tested compiler exception

TypeScript 7.0.2 is the registry's newest stable release, but `vue-tsc` 3.3.12 fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` for `typescript/lib/tsc`. Pin TypeScript 6.0.3 (the latest 6.x maintenance release) for the shared toolchain until the Vue checker supports the native compiler. Remove deprecated `baseUrl`; explicit `paths` already resolve relative to the configuration file. This exception preserves Vue template type checking rather than bypassing it.

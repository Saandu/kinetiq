# Phase 1: a local Kubernetes cluster

## What this step builds

We already have a working application in Docker Compose. This step creates the
Kubernetes environment that will run the same service images in later commits.
No application workloads, database operator or cloud resources are installed yet.

Think of Docker as the container engine and Kubernetes as the system that decides
which containers should run, checks their health and replaces failed workloads.
k3s is a Kubernetes distribution with fewer separate installation steps. k3d runs
k3s nodes inside Docker containers, allowing us to practise on this Windows PC.
One local node serves both as the control plane and the worker. That is useful for
development, but provides no redundancy if the node or PC fails.

## The three tools

| Tool | What it does here |
|---|---|
| k3d 5.9.0 | Creates, starts and stops the Docker containers representing our cluster |
| kubectl 1.36.5 | Talks to the Kubernetes API to inspect or change cluster objects |
| Helm 4.3.0 | Will render and install our application chart in the next step |

`scripts/setup-k8s-tools.mjs` downloads exact upstream artifacts using the URLs
and SHA-256 checksums in `infra/k8s/local/tools.json`. A checksum binds the download
to the artifact we selected; it does not independently prove the publisher's
identity. We use official upstream URLs and refuse a download with different bytes.
Verified archives are cached and checked again when setup is repeated.

The installer currently supports Windows x64. It uses Windows' built-in `tar.exe`
to extract only Helm's executable from the verified ZIP. The later CI step will
need its own Linux artifact pins; Windows setup is not evidence of Linux CI support.

All tools, archives and the kubeconfig live in the repository's ignored `.tools/k8s`
directory on D:. Nothing changes the global PATH or installs into Program Files.
Docker stores cluster containers and their writable data in its configured disk
image, which we have moved to D:. Moving this repository alone would not move
Docker's disk image.

## Why the cluster uses Kubernetes 1.36

The selected image is k3s `v1.36.5-k3s1`, pinned by immutable digest in
`infra/k8s/local/cluster.yaml`. k3d's printed default image version is not the
version running in this cluster: the configuration explicitly overrides it.

CloudNativePG 1.30 supports Kubernetes 1.34–1.36, and KEDA 2.21 tests that same
range. Helm 4.3 supports 1.34–1.37. Therefore 1.36 is the supported intersection,
even though k3s also offers a newer minor release. Running current tools together
requires checking their compatibility, rather than selecting each newest number
independently. See the linked upstream matrices in `STACK_VERSIONS.md`.

## Connections, credentials and memory

A kubeconfig contains the API address, context and credentials. Treat it as a
secret. Our wrapper passes `.tools/k8s/kinetiq.kubeconfig` explicitly and checks
that it refers to `k3d-kinetiq-local` at `https://127.0.0.1:16550`. It does not
merge credentials into your default kubeconfig or switch its current context.
Avoid displaying the raw kubeconfig in screenshots, logs or Git.

The API binds to loopback port 16550. Port 3102 also binds to loopback and will
serve application ingress later. An empty cluster has no dashboard at that port.
Compose continues using port 3101. The k3d proxy forwards requests to the node;
Traefik inside the node will later route HTTP requests to Kubernetes Services.

The server container has an 8 GiB Docker memory cap. This is a ceiling, not 8 GiB
allocated immediately. The actual foundation usage is measured with Docker stats.
Later charts must budget both application and operator resources beneath that
ceiling, with space for Kubernetes itself. This cap does not prove the complete
production stack fits, and a single node does not provide high availability.

On this PC, Docker currently reports only 6.7 GiB total VM memory. That is the
effective ceiling even with an 8 GiB container cap. Increase the WSL/Docker memory
allocation before deploying the complete stack; the empty foundation does not
require that change. This affects RAM allocation, not the disk location on D:.

## Commands to use

From the repository root, with Docker Desktop running:

```powershell
npm run k8s:tools
npm run k8s:up
npm run k8s:images
npm run k8s:images:verify
npm run k8s:verify
npm run k8s:status
npm run k8s:kubectl -- get deployments -n kube-system
npm run k8s:stop
npm run k8s:up
```

`k8s:up` creates the cluster if missing, otherwise starts it, writes the isolated
kubeconfig and checks readiness. `k8s:stop` stops only this cluster and preserves
its containers and data. Stopping is not a backup: deleting the cluster or losing
Docker's disk can lose that data. The future S3 restore drill is still necessary.

Kubernetes uses containerd inside the k3d node. Building an image in Docker does
not automatically put it in that separate image store. `k8s:images` imports and
checks all six existing Kinetiq images. Rebuild and reimport after changing service
code. Importing an image does not create a Deployment or run the application.
Helm will later supply those objects and the local image pull policy.

`k8s:verify` waits for a Ready node and completed rollouts of CoreDNS, metrics-server,
Traefik and local-path-provisioner. It checks the actual kubelet version, loopback
port bindings and Docker memory cap, then prints nodes, Pods and memory usage.
CoreDNS resolves Service names; metrics-server reports Pod/node resource usage;
local-path-provisioner creates storage on the node. None replaces a tested backup.

If startup fails, inspect `npm run k8s:status`, then
`npm run k8s:kubectl -- get events -A --sort-by=.metadata.creationTimestamp`.
Image downloads and system Pods can take time on the first start. Diagnose the
failed readiness check before deleting containers or volumes.

## Practise and explain

1. Run the status command and locate the single Ready node and system Pods.
2. Stop the cluster and confirm Kubernetes requests fail while it is stopped.
3. Start it again and confirm the same node returns Ready. Run `k8s:images:verify`
   to confirm the imported images survived without importing them again.
4. Explain why a Docker image build and a Kubernetes Deployment are different.

Interview questions: What does the control plane do? Why is a kubeconfig sensitive?
Why does an 8 GiB limit differ from measured memory usage? Why can stopping and
starting a node succeed while restoring a database to a new node still fails?

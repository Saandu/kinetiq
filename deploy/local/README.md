# Local GitOps boundary

`npm run k8s:gitops` installs pinned Argo CD Core, publishes the current committed
branch to an internal read-only Git mirror and creates the restricted Kinetiq
Application. The scripts construct the local Application because the branch
name and committed SHA vary between checkouts. The chart remains the desired
application state in Git. No GitHub credentials are stored in the cluster.

Run `npm run k8s:gitops:publish` after a commit to publish a new snapshot of that
same branch. This does not push to GitHub. Uncommitted files and `.env.local` are
never published. The local mirror is a disposable learning/CI transport; cloud
GitOps will read GitHub and use immutable image tags.

Bootstrap owns operators, database, backup storage, broker, credentials and KEDA.
It also supplies the stable hook service accounts and restrictive network rules
before the first sync. Argo owns the application's chart resources only.
Migrations and queue creation are PreSync hooks carrying their own scripts, so
they cannot accidentally run an earlier ConfigMap revision. Migrations connect
directly to the existing database service before the chart's alias exists.
Only backward-compatible expand/contract migrations are allowed: old Pods still
serve while hooks run. A failed hook prevents the new workload sync.

The Application ignores KEDA's `/spec/replicas` field on the ingest Deployment
and respects that exclusion during sync. Otherwise self-heal would fight the HPA.
Automated pruning cannot remove Secrets, PVCs, CloudNativePG clusters or namespace
objects because the AppProject permits none of those kinds. No Application
deletion finalizer is configured; removing this local Application does not delete
the running application or its database. Do not use `helm upgrade` after adoption.
Argo Core has no public UI or server. Inspect status with
`npm run k8s:gitops:status` and use the dashboard on http://127.0.0.1:3102.

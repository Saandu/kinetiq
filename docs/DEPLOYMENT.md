# Continuous delivery

The workflow is [`.github/workflows/verify.yml`](../.github/workflows/verify.yml).

| Event | Behavior |
|---|---|
| Push to any branch | Install locked dependencies, run tests, type-check, build and audit production dependencies |
| Pull request | Run the same verification, without deployment credentials |
| Push to `main`, including a merged PR | After verification succeeds, deploy the exact build artifact to Firebase Hosting |

Production URL: **https://kinetiq-dashboard.web.app**  
Firebase project: `kinetiq-app-k7x2`  
Hosting site: `kinetiq-dashboard` (selected in `firebase.json`)

## Deployment sequence

1. The `verify` job runs `npm ci`, `npm run verify` and the production dependency
   audit. A failure stops delivery.
2. On a `main` push, it uploads `dist/` as an artifact named with the commit SHA.
3. The `deploy` job downloads that artifact without rebuilding it. The Firebase
   CLI version is pinned to `15.9.0`.
4. The job checks the current `main` SHA before authenticating. If a newer commit
   exists, this older deployment is skipped. Main-branch runs are serialized so
   an active Firebase deployment is not canceled halfway through.
5. Google Workload Identity Federation supplies short-lived credentials. The
   Firebase CLI deploys Hosting only, with the commit SHA as the release message.
6. The smoke check compares published HTML and initial assets against `dist/`,
   checks a deep-link fallback and the Content Security Policy, then records the
   deployment URL and commit in the Actions summary. A mismatch fails the job.

The workflow gates deployment, not the GitHub merge button. If you want to block
merging failing PRs as well, configure `verify` as a required status check in the
repository's branch rules.

## Authentication

No Firebase token or service-account JSON key is stored in the repository or
GitHub secrets. The setup uses these **repository Actions variables**:

| Variable | Value |
|---|---|
| `FIREBASE_WORKLOAD_IDENTITY_PROVIDER` | `projects/977148765846/locations/global/workloadIdentityPools/github-kinetiq/providers/github` |
| `FIREBASE_DEPLOY_SERVICE_ACCOUNT` | `github-hosting-deploy@kinetiq-app-k7x2.iam.gserviceaccount.com` |

These are identifiers, not credentials. Temporary `gha-creds-*.json` files are
ignored by Git and removed by the authentication action after the job.

The provider accepts only GitHub tokens matching all of:

- Repository ID `1357620560`, owned by owner ID `72700572`.
- Branch `refs/heads/main` and event `push`.
- Workflow `Saandu/kinetiq/.github/workflows/verify.yml@refs/heads/main`.

The dedicated service account has Firebase Hosting Admin and Service Usage
Consumer roles on this Firebase project. The identity pool's repository
principal has Workload Identity User on that service account. It has no database
administration or project-owner role, and no user-managed key was created.

Renaming the repository or workflow, transferring ownership, changing the
production branch, or moving Firebase projects requires updating the provider
condition and/or variables before the next deployment.

## First run and troubleshooting

The workflow must be committed and pushed before GitHub can execute it. Follow
the run in [GitHub Actions](https://github.com/Saandu/kinetiq/actions). Success is
confirmed only when both verification and deployment finish successfully.

- **Verification fails:** fix the reported test, build or advisory issue and push
  again. No deployment is attempted.
- **Authentication fails:** check the two Actions variables, provider condition
  and service-account bindings. Never paste credentials into a log or issue.
- **Deployment succeeds but smoke verification fails:** inspect the Hosting
  release and Actions logs. The job is deliberately marked failed; it does not
  automatically roll back an already-published release.
- **Rollback:** revert the problematic commit and push the revert to `main` so
  the restored version goes through the same checks and deployment. An older
  run cannot be rerun to deploy over newer `main` because of the SHA check.

Configuration references: [Google authentication action](https://github.com/google-github-actions/auth)
and [Firebase CLI authentication](https://firebase.google.com/docs/cli#cli-ci-systems).

import { root, run, tool, kubeconfig } from './setup-k8s-tools.mjs';
import { assertLocalCluster, kubectl, namespace, capture } from './local-kubernetes.mjs';
import path from 'node:path';

assertLocalCluster();
const argoInstalled = kubectl(['get', 'crd', 'applications.argoproj.io', '--ignore-not-found', '-o', 'name'], capture).trim();
const argo = argoInstalled ? kubectl(['get', 'applications.argoproj.io', 'kinetiq', '-n', 'argocd', '--ignore-not-found', '-o', 'name'], capture) : '';
if (argo.trim()) throw new Error('Argo owns this application. Commit and run k8s:gitops:publish instead of Helm upgrade.');
// Platform setup owns the broker/database; Helm owns application resources.
run(process.execPath, ['scripts/setup-k8s-database.mjs']);
run(process.execPath, ['scripts/setup-k8s-messaging.mjs']);
run(tool('helm'), ['upgrade', '--install', 'kinetiq', path.join(root, 'infra/helm/kinetiq'),
  '--kubeconfig', kubeconfig, '--namespace', namespace,
  '--values', path.join(root, 'infra/helm/kinetiq/local/values.yaml'), '--timeout', '5m']);
const release = JSON.parse(run(tool('helm'), ['status', 'kinetiq', '--kubeconfig', kubeconfig,
  '--namespace', namespace, '-o', 'json'], capture));
for (const component of ['migrations', 'queues']) {
  kubectl(['wait', `job/kinetiq-${component}-${release.version}`, '-n', namespace,
    '--for=condition=complete', '--timeout=180s']);
}
for (const component of ['api', 'ingest', 'web', 'simulator', 'local-bridge']) {
  // Local :local tags are rebuilt/imported in place; a fresh revision must use the new image.
  kubectl(['rollout', 'restart', `deployment/kinetiq-${component}`, '-n', namespace]);
  kubectl(['rollout', 'status', `deployment/kinetiq-${component}`, '-n', namespace, '--timeout=180s']);
}
run(process.execPath, ['scripts/verify-k8s-app.mjs']);

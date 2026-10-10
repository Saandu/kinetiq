import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAllDocuments } from 'yaml';
import { root, run, tool, toolDirectory } from './setup-k8s-tools.mjs';
import { kubectl, capture, namespace } from './local-kubernetes.mjs';

export const argoNamespace = 'argocd';
export const repository = `git://kinetiq-git.${namespace}.svc.cluster.local:9418/kinetiq.git`;
export const pin = JSON.parse(await readFile(path.join(root, 'infra/k8s/local/argocd.json'), 'utf8'));
export const parse = text => parseAllDocuments(text, {uniqueKeys: true}).map(document => {
  if (document.errors.length) throw new Error(document.errors.map(e => e.message).join('\n'));
  return document.toJS();
}).filter(Boolean);
export function branch() {
  const name = run('git', ['branch', '--show-current'], capture).trim() ||
    (process.env.GITHUB_ACTIONS === 'true' ? process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME : '');
  if (!name || !/^[a-zA-Z0-9._/-]+$/.test(name)) throw new Error('GitOps needs a named Git branch');
  return name;
}
export const application = () => JSON.parse(kubectl(['get', 'application', 'kinetiq', '-n', argoNamespace, '-o', 'json'], capture));
export function project() {
  return {apiVersion: 'argoproj.io/v1alpha1', kind: 'AppProject', metadata: {name: 'kinetiq-local', namespace: argoNamespace}, spec: {
    description: 'Local application only; bootstrap owns data and credentials',
    sourceRepos: [repository], destinations: [{server: 'https://kubernetes.default.svc', namespace}],
    clusterResourceWhitelist: [], namespaceResourceWhitelist: [
      ['', 'ConfigMap'], ['', 'Service'], ['', 'ServiceAccount'], ['apps', 'Deployment'],
      ['batch', 'Job'], ['networking.k8s.io', 'Ingress'], ['networking.k8s.io', 'NetworkPolicy'],
    ].map(([group, kind]) => ({group, kind})),
  }};
}
export function desiredApplication(profile = 'local') {
  if (!['local', 'ci'].includes(profile)) throw new Error('Unknown GitOps profile');
  return {apiVersion: 'argoproj.io/v1alpha1', kind: 'Application', metadata: {name: 'kinetiq', namespace: argoNamespace}, spec: {
    project: 'kinetiq-local', source: {repoURL: repository, targetRevision: branch(), path: 'infra/helm/kinetiq',
      helm: {releaseName: 'kinetiq', kubeVersion: '1.36.5', valueFiles: [`${profile}/values.yaml`], parameters: [{name: 'gitops.enabled', value: 'true'}]}},
    destination: {server: 'https://kubernetes.default.svc', namespace},
    ignoreDifferences: [{group: 'apps', kind: 'Deployment', name: 'kinetiq-ingest', namespace, jsonPointers: ['/spec/replicas']}],
    syncPolicy: {automated: {prune: true, selfHeal: true, allowEmpty: false},
      syncOptions: ['RespectIgnoreDifferences=true', 'FailOnSharedResource=true'],
      retry: {limit: 3, backoff: {duration: '5s', factor: 2, maxDuration: '30s'}}},
  }};
}
export async function waitApplication(revision, timeout = 240_000) {
  const deadline = Date.now() + timeout;
  let state;
  while (Date.now() < deadline) {
    state = application().status;
    if (state?.operationState?.syncResult?.revision === revision &&
        ['Failed','Error'].includes(state.operationState.phase)) {
      throw new Error(`Argo sync failed: ${state.operationState.message}`);
    }
    if (state?.sync?.status === 'Synced' && state?.health?.status === 'Healthy' &&
      state.sync.revision === revision && state.operationState?.phase === 'Succeeded') {
      console.log(`Argo: Synced, Healthy, successful hooks at ${revision}`); return state;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`Argo did not reach Healthy/Synced: ${JSON.stringify({sync:state?.sync,health:state?.health,conditions:state?.conditions,operation:state?.operationState?.phase})}`);
}
export function render(profile = 'local') {
  return parse(run(tool('helm'), ['template', 'kinetiq', path.join(root, 'infra/helm/kinetiq'), '-n', namespace,
    '-f', path.join(root, `infra/helm/kinetiq/${profile}/values.yaml`), '--kube-version', '1.36.5', '--set', 'gitops.enabled=true'], capture));
}
export const mirrorDirectory = path.join(toolDirectory, 'gitops');

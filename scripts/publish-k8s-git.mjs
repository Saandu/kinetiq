import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { root, run } from './setup-k8s-tools.mjs';
import { assertLocalCluster, kubectl, capture, namespace } from './local-kubernetes.mjs';
import { branch, mirrorDirectory, waitApplication } from './local-gitops.mjs';

export async function publish() {
  assertLocalCluster();
  const name = branch();
  const sha = run('git', ['rev-parse', 'HEAD'], capture).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Unexpected Git SHA');
  await mkdir(mirrorDirectory, {recursive: true});
  const publication = path.join(mirrorDirectory, `${Date.now()}`);
  await mkdir(publication, {recursive: true});
  const snapshot = path.join(publication, `${sha}.git`);
  // A bare clone includes committed objects only; never copy the working tree.
  run('git', ['clone', '--bare', '--single-branch', '--branch', name, root, snapshot], capture);
  run('git', ['--git-dir', snapshot, 'remote', 'remove', 'origin'], capture);
  const pods = JSON.parse(kubectl(['get', 'pods', '-n', namespace, '-l', 'app.kubernetes.io/name=kinetiq-git', '-o', 'json'], capture));
  const pod = pods.items.find(p => p.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True'))?.metadata.name;
  if (!pod) throw new Error('Git mirror is not ready');
  const target = `${sha}-${Date.now()}.git`;
  kubectl(['cp', '--no-preserve', path.relative(root, snapshot), `${namespace}/${pod}:/data/${target}`, '-c', 'git'], capture);
  // Atomic pointer change means Argo cannot fetch a half-copied repository.
  kubectl(['exec', '-n', namespace, pod, '-c', 'git', '--', 'sh', '-ec',
    `ln -sfn /data/${target} /data/kinetiq.git.next; mv -Tf /data/kinetiq.git.next /data/kinetiq.git`], capture);
  console.log(`Published committed branch ${name} at ${sha} to the internal Git mirror`);
  return sha;
}
if (process.argv[1]?.endsWith('publish-k8s-git.mjs')) {
  const sha = await publish();
  kubectl(['annotate', 'application/kinetiq', '-n', 'argocd', 'argocd.argoproj.io/refresh=hard', '--overwrite']);
  await waitApplication(sha);
}

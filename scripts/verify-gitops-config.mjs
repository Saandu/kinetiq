import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';
import { run, tool, toolDirectory } from './setup-k8s-tools.mjs';
import { render, project, desiredApplication, pin } from './local-gitops.mjs';
for(const profile of ['local','ci']) {
  const objects=render(profile);
  const output=path.join(toolDirectory,'helm',`gitops-${profile}.yaml`);
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,objects.map(o=>stringify(o)).join('\n---\n'));
  run(tool('kubeconform'),['-strict','-summary','-kubernetes-version','1.36.5','-schema-location',
    'https://raw.githubusercontent.com/yannh/kubernetes-json-schema/5f1fa4f7908afc9b6641c62d282a4a22437626e1/{{.NormalizedKubernetesVersion}}-standalone{{.StrictSuffix}}/{{.ResourceKind}}{{.KindSuffix}}.json',
    '-cache',path.join(toolDirectory,'schema-cache'),output]);
  const jobs=objects.filter(o=>o.kind==='Job');
  assert.equal(jobs.length,2);
  for(const job of jobs) {
    assert.equal(job.metadata.annotations['argocd.argoproj.io/hook'],'PreSync');
    assert.equal(job.metadata.annotations['argocd.argoproj.io/sync-wave'],'-1');
    assert.equal(job.metadata.annotations['argocd.argoproj.io/hook-delete-policy'],'BeforeHookCreation,HookSucceeded');
    assert.ok(!job.spec.template.spec.volumes.some(v=>v.configMap),'First sync cannot depend on Sync ConfigMaps');
    assert.deepEqual(job.spec.template.spec.containers[0].command,['node','--input-type=module','-e']);
    assert.ok(job.spec.template.spec.containers[0].args[0].includes('try {'));
    assert.equal(job.spec.template.spec.automountServiceAccountToken,false);
  }
  const app=desiredApplication(profile);
  assert.equal(app.metadata.finalizers,undefined);
  assert.equal(app.spec.syncPolicy.automated.allowEmpty,false);
  assert.ok(app.spec.syncPolicy.syncOptions.includes('RespectIgnoreDifferences=true'));
  assert.deepEqual(app.spec.ignoreDifferences[0].jsonPointers,['/spec/replicas']);
  console.log(`${profile}: self-contained PreSync hooks and bounded GitOps ownership checked`);
}
assert.deepEqual(project().spec.clusterResourceWhitelist,[]);
for(const kind of ['Secret','PersistentVolumeClaim','Cluster','Namespace','Role','RoleBinding']) {
  assert.ok(!project().spec.namespaceResourceWhitelist.some(r=>r.kind===kind));
}
for(const image of [pin.image,pin.redisImage]) assert.match(image,/@sha256:[a-f0-9]{64}$/);
assert.match(pin.sha256,/^[a-f0-9]{64}$/);
console.log('GitOps configuration checks passed. Runtime reconciliation is checked separately.');

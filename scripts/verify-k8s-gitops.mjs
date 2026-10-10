import assert from 'node:assert/strict';
import { run } from './setup-k8s-tools.mjs';
import { assertLocalCluster, kubectl, capture, namespace } from './local-kubernetes.mjs';
import { application, waitApplication, argoNamespace, repository } from './local-gitops.mjs';

assertLocalCluster();
if (process.argv[2] === 'status') {
  const {spec,status} = application();
  console.log(JSON.stringify({branch:spec.source.targetRevision,revision:status?.sync?.revision,
    sync:status?.sync?.status,health:status?.health?.status,operation:status?.operationState?.phase},null,2));
} else {
  const sha = run('git',['rev-parse','HEAD'],capture).trim();
  await waitApplication(sha);
  const app = application();
  assert.equal(app.spec.source.repoURL,repository);
  assert.equal(app.spec.syncPolicy.syncOptions.includes('RespectIgnoreDifferences=true'),true);
  const jobs = app.status.operationState.syncResult.resources.filter(r=>r.kind==='Job');
  assert.equal(jobs.length,2,'Both ordered hooks must have run');
  for(const job of jobs) { assert.equal(job.hookType,'PreSync'); assert.equal(job.hookPhase,'Succeeded'); }
  const project = JSON.parse(kubectl(['get','appproject','kinetiq-local','-n',argoNamespace,'-o','json'],capture));
  assert.deepEqual(project.spec.clusterResourceWhitelist ?? [],[]);
  const allowed = project.spec.namespaceResourceWhitelist.map(r=>r.kind);
  for(const kind of ['Secret','PersistentVolumeClaim','Cluster','Namespace']) assert.ok(!allowed.includes(kind));
  // Change a field that Git owns. Three-way apply can preserve unrelated extra
  // annotations, so adding a brand-new annotation is not a useful drift test.
  const before = JSON.parse(kubectl(['get','deployment/kinetiq-web','-n',namespace,'-o','json'],capture));
  const checksum = before.spec.template.metadata.annotations['checksum/config'];
  assert.match(checksum,/^[a-f0-9]{64}$/);
  kubectl(['patch','deployment/kinetiq-web','-n',namespace,'--type=merge','-p',
    JSON.stringify({spec:{template:{metadata:{annotations:{'checksum/config':'drift-verification'}}}}})]);
  kubectl(['annotate','application/kinetiq','-n',argoNamespace,'argocd.argoproj.io/refresh=hard','--overwrite']);
  const deadline=Date.now()+150_000;
  let healed=false;
  while(Date.now()<deadline) {
    const web=JSON.parse(kubectl(['get','deployment/kinetiq-web','-n',namespace,'-o','json'],capture));
    if(web.spec.template.metadata.annotations?.['checksum/config']===checksum) { healed=true;break; }
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  assert.equal(healed,true,'Argo must self-heal manual template drift');
  await waitApplication(sha);
  run(process.execPath,['scripts/verify-k8s-app.mjs']);
  console.log('Git revision, both PreSync hooks, resource ownership and live drift correction verified.');
}

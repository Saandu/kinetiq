import path from 'node:path';
import { root, run } from './setup-k8s-tools.mjs';
import { kubectl, namespace } from './local-kubernetes.mjs';

if(!process.env.npm_execpath) throw new Error('Use npm run k8s:bootstrap');
const status = run('git',['status','--porcelain'],{stdio:'pipe'}).trim();
if(status) throw new Error('Commit repository changes before bootstrapping the committed GitOps application');
const compose = run('docker',['ps','--filter','label=com.docker.compose.project=kinetiq','--format','{{.Names}}'],{stdio:'pipe'}).trim();
if(compose) throw new Error('Stop the Compose stack before the complete Kubernetes bootstrap to preserve laptop memory');
process.loadEnvFile(path.join(root,'.env.local'));
if(!process.env.LOCALSTACK_AUTH_TOKEN) throw new Error('Set the root .env.local LocalStack token first');
const script = (name,...args) => run(process.execPath,[`scripts/${name}.mjs`,...args]);
const npm = (...args) => run(process.execPath,[process.env.npm_execpath,...args]);

script('setup-k8s-tools');
npm('run','build','--workspace','@kinetiq/contracts');
npm('run','docker:lint');
npm('run','db:image');
npm('run','services:images');
run('docker',['build','-t','kinetiq-web:local','-f','infra/docker/web/Dockerfile','.']);
script('k8s-cluster','up');
script('k8s-cluster','images');
script('setup-k8s-operators');
script('setup-k8s-database');
script('setup-k8s-messaging');
script('setup-k8s-gitops');
script('setup-k8s-scaling');
// Development images use :local. Restart after import so rebuilt code really
// runs; the production delivery will instead change immutable tags in Git.
for(const name of ['api','ingest','web','simulator','local-bridge']) {
  kubectl(['rollout','restart',`deployment/kinetiq-${name}`,'-n',namespace]);
  kubectl(['rollout','status',`deployment/kinetiq-${name}`,'-n',namespace,'--timeout=180s']);
}
script('verify-k8s-app');
console.log('Complete local bootstrap ready at http://127.0.0.1:3102. Database volumes preserved.');

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { toolDirectory } from './setup-k8s-tools.mjs';
import { assertLocalCluster, apply, kubectl, capture, namespace } from './local-kubernetes.mjs';
import { argoNamespace, pin, parse, project, desiredApplication, render, waitApplication } from './local-gitops.mjs';
import { publish } from './publish-k8s-git.mjs';

assertLocalCluster();
const profile = process.argv[2] ?? 'local';
const desired = desiredApplication(profile);
const upstream = path.join(toolDirectory, 'downloads', `argocd-core-v${pin.version}.yaml`);
await mkdir(path.dirname(upstream), {recursive: true});
let bytes;
try { bytes = await readFile(upstream); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const hash = data => createHash('sha256').update(data).digest('hex');
if (!bytes || hash(bytes) !== pin.sha256) {
  const response = await fetch(pin.url, {signal: AbortSignal.timeout(90_000)});
  if (!response.ok) throw new Error(`Argo manifest download failed: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== pin.sha256) throw new Error('Argo manifest checksum mismatch');
  await writeFile(upstream, bytes);
}
const objects = parse(bytes.toString()).filter(o => !o.metadata.name.includes('applicationset'));
const limits = {'argocd-application-controller': 384, 'argocd-repo-server': 384, 'argocd-redis': 128};
for (const o of objects) {
  if (!['CustomResourceDefinition', 'ClusterRole', 'ClusterRoleBinding'].includes(o.kind)) o.metadata.namespace = argoNamespace;
  for (const subject of o.subjects ?? []) if (subject.kind === 'ServiceAccount') subject.namespace = argoNamespace;
  if (o.kind === 'ConfigMap' && o.metadata.name === 'argocd-cm') o.data = {
    'timeout.reconciliation': '30s', 'timeout.reconciliation.jitter': '0s',
    'resource.exclusions': '- apiGroups: ["cilium.io"]\n  kinds: [CiliumIdentity]\n  clusters: ["*"]\n',
  };
  if (o.kind === 'ConfigMap' && o.metadata.name === 'argocd-cmd-params-cm') o.data = {
    'controller.status.processors': '2', 'controller.operation.processors': '1',
    'reposerver.parallelism.limit': '1',
  };
  if (['Deployment', 'StatefulSet'].includes(o.kind)) {
    if (o.kind === 'Deployment') o.spec.strategy = {type: 'Recreate'};
    for (const c of [...o.spec.template.spec.containers, ...(o.spec.template.spec.initContainers ?? [])]) {
      c.image = c.image.includes('/redis:') ? pin.redisImage : pin.image;
      c.resources = {requests: {cpu: '25m', memory: '64Mi'}, limits: {cpu: '500m', memory: `${limits[o.metadata.name]}Mi`}};
    }
  }
}
apply([{apiVersion: 'v1', kind: 'Namespace', metadata: {name: argoNamespace}}, ...objects]);
const apiIp = kubectl(['get','service','kubernetes','-n','default','-o','jsonpath={.spec.clusterIP}'],capture).trim();
const nodeIp = kubectl(['get','node','k3d-kinetiq-local-server-0','-o','jsonpath={.status.addresses[?(@.type=="InternalIP")].address}'],capture).trim();
if (![apiIp,nodeIp].every(ip=>/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))) throw new Error('Expected local API addresses');
apply([{apiVersion:'networking.k8s.io/v1',kind:'NetworkPolicy',metadata:{name:'argocd-local-egress',namespace:argoNamespace},spec:{podSelector:{},policyTypes:['Egress'],egress:[
  {to:[{namespaceSelector:{matchLabels:{'kubernetes.io/metadata.name':argoNamespace}}}],ports:[{protocol:'TCP',port:6379},{protocol:'TCP',port:8081}]},
  {to:[{namespaceSelector:{matchLabels:{'kubernetes.io/metadata.name':'kube-system'}},podSelector:{matchLabels:{'k8s-app':'kube-dns'}}}],ports:[{protocol:'UDP',port:53},{protocol:'TCP',port:53}]},
  {to:[{ipBlock:{cidr:`${apiIp}/32`}},{ipBlock:{cidr:`${nodeIp}/32`}}],ports:[{protocol:'TCP',port:443},{protocol:'TCP',port:6443}]},
  {to:[{namespaceSelector:{matchLabels:{'kubernetes.io/metadata.name':namespace}},podSelector:{matchLabels:{'app.kubernetes.io/name':'kinetiq-git'}}}],ports:[{protocol:'TCP',port:8080}]},
]}}]);
for (const name of ['applications', 'appprojects']) kubectl(['wait', `crd/${name}.argoproj.io`, '--for=condition=Established', '--timeout=60s']);
for (const name of ['deployment/argocd-redis', 'deployment/argocd-repo-server', 'statefulset/argocd-application-controller']) {
  kubectl(['rollout', 'status', name, '-n', argoNamespace, '--timeout=240s']);
}

// Storage contains only committed Git history, never application/database data.
const nginx = `pid /tmp/nginx.pid; events {} http { access_log /dev/stdout; error_log /dev/stderr; client_body_temp_path /tmp/client; proxy_temp_path /tmp/proxy; fastcgi_temp_path /tmp/fastcgi; uwsgi_temp_path /tmp/uwsgi; scgi_temp_path /tmp/scgi; server { listen 8080; root /data; location / { try_files $uri =404; } } }`;
apply([
  {apiVersion:'v1',kind:'PersistentVolumeClaim',metadata:{name:'kinetiq-git',namespace},spec:{accessModes:['ReadWriteOnce'],storageClassName:'local-path',resources:{requests:{storage:'512Mi'}}}},
  {apiVersion:'v1',kind:'ConfigMap',metadata:{name:'kinetiq-git',namespace},data:{'nginx.conf':nginx}},
  {apiVersion:'apps/v1',kind:'Deployment',metadata:{name:'kinetiq-git',namespace},spec:{replicas:1,strategy:{type:'Recreate'},selector:{matchLabels:{'app.kubernetes.io/name':'kinetiq-git'}},template:{metadata:{labels:{'app.kubernetes.io/name':'kinetiq-git'}},spec:{automountServiceAccountToken:false,securityContext:{runAsNonRoot:true,runAsUser:101,runAsGroup:101,fsGroup:101,seccompProfile:{type:'RuntimeDefault'}},containers:[{name:'git',image:'kinetiq-web:local',imagePullPolicy:'Never',command:['nginx','-c','/config/nginx.conf','-g','daemon off;'],securityContext:{readOnlyRootFilesystem:true,allowPrivilegeEscalation:false,capabilities:{drop:['ALL']}},resources:{requests:{cpu:'10m',memory:'16Mi'},limits:{cpu:'100m',memory:'64Mi'}},ports:[{containerPort:8080}],readinessProbe:{tcpSocket:{port:8080}},volumeMounts:[{name:'git',mountPath:'/data'},{name:'config',mountPath:'/config',readOnly:true},{name:'tmp',mountPath:'/tmp'}]}],volumes:[{name:'git',persistentVolumeClaim:{claimName:'kinetiq-git'}},{name:'config',configMap:{name:'kinetiq-git'}},{name:'tmp',emptyDir:{sizeLimit:'64Mi'}}]}}}},
  {apiVersion:'v1',kind:'Service',metadata:{name:'kinetiq-git',namespace},spec:{type:'ClusterIP',selector:{'app.kubernetes.io/name':'kinetiq-git'},ports:[{port:8080,targetPort:8080}]}},
  {apiVersion:'networking.k8s.io/v1',kind:'NetworkPolicy',metadata:{name:'kinetiq-git',namespace},spec:{podSelector:{matchLabels:{'app.kubernetes.io/name':'kinetiq-git'}},policyTypes:['Ingress','Egress'],egress:[],ingress:[{from:[{namespaceSelector:{matchLabels:{'kubernetes.io/metadata.name':argoNamespace}},podSelector:{matchLabels:{'app.kubernetes.io/name':'argocd-repo-server'}}}],ports:[{protocol:'TCP',port:8080}]}]}},
]);
kubectl(['rollout','status','deployment/kinetiq-git','-n',namespace,'--timeout=120s']);

// Fresh-install hook prerequisites are stable and contain no code or credentials.
// Argo adopts them during Sync. ConfigMaps and aliases are deliberately excluded.
const prerequisites = render(profile).filter(o =>
  o.kind === 'ServiceAccount' && ['kinetiq-migrations','kinetiq-queues'].includes(o.metadata.name) ||
  o.kind === 'NetworkPolicy' && ['kinetiq-default-deny','kinetiq-dns','kinetiq-migrations-egress','kinetiq-queues-egress'].includes(o.metadata.name));
for (const o of prerequisites) o.metadata.namespace = namespace;
apply(prerequisites);
const sha = await publish();
apply([project(), desired]);
kubectl(['annotate','application/kinetiq','-n',argoNamespace,'argocd.argoproj.io/refresh=hard','--overwrite']);
await waitApplication(sha);
console.log('Argo Core uses 896 MiB steady limits plus a 64 MiB Git mirror; no public Argo server.');

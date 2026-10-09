import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { root, toolDirectory, run, tool, kubeconfig } from './setup-k8s-tools.mjs';
import { apply, assertLocalCluster, kubectl, capture } from './local-kubernetes.mjs';

assertLocalCluster();
const pins = JSON.parse(await readFile(path.join(root, 'infra/k8s/local/operators.json'), 'utf8'));
const directory = path.join(toolDirectory, 'platform');
await mkdir(directory, { recursive: true });
async function download(pin) {
  const file = path.join(directory, path.basename(new URL(pin.url).pathname));
  let bytes;
  try { bytes = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const hash = value => createHash('sha256').update(value).digest('hex');
  if (!bytes || hash(bytes) !== pin.sha256) {
    const response = await fetch(pin.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Operator download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== pin.sha256) throw new Error('Operator checksum mismatch');
    await writeFile(file, bytes);
  }
  if (hash(bytes) !== pin.sha256) throw new Error('Operator checksum mismatch');
  return { file, bytes };
}
const [cert, cnpg, barman] = await Promise.all([download(pins.certManager), download(pins.cnpg), download(pins.barman)]);
const certObjects = YAML.parseAllDocuments(cert.bytes.toString()).map(document => document.toJSON()).filter(Boolean);
for (const object of certObjects.filter(object => object.kind === 'Deployment')) {
  object.spec.strategy = { type: 'Recreate' };
  for (const container of object.spec.template.spec.containers) {
    const digest = pins.certManager.images[container.image];
    if (!digest) throw new Error('Unpinned cert-manager image');
    container.image += `@${digest}`;
    container.resources = { requests: { cpu: '25m', memory: '32Mi' }, limits: { cpu: '500m', memory: '128Mi' } };
  }
}
apply(certObjects);
for (const name of ['cert-manager', 'cert-manager-cainjector', 'cert-manager-webhook']) {
  kubectl(['rollout', 'status', `deployment/${name}`, '-n', 'cert-manager', '--timeout=240s']);
}
function install(name, archive, values) {
  const file = path.join(directory, `${name}-values.yaml`);
  return writeFile(file, YAML.stringify(values)).then(() => {
    run(tool('helm'), ['upgrade', '--install', name, archive.file, '--kubeconfig', kubeconfig,
      '--namespace', 'cnpg-system', '--create-namespace', '--values', file, '--wait', '--timeout', '240s']);
  });
}
const resources = { requests: { cpu: '50m', memory: '64Mi' }, limits: { cpu: '1000m', memory: '256Mi' } };
await install('cnpg', cnpg, {
  fullnameOverride: 'cnpg-controller-manager', image: { tag: pins.cnpg.tag }, resources,
  updateStrategy: { type: 'Recreate' }, config: { data: { WATCH_NAMESPACE: 'kinetiq-local' } },
});
await install('barman', barman, {
  fullnameOverride: 'barman-cloud', image: { tag: pins.barman.tag },
  sidecarImage: { tag: pins.barman.sidecarTag }, resources, updateStrategy: { type: 'Recreate' },
});
// CNPG applies the Cluster's Never pull policy to its backup sidecar as well.
const sidecar = `ghcr.io/cloudnative-pg/plugin-barman-cloud-sidecar:${pins.barman.sidecarTag}`;
run('docker', ['exec', 'k3d-kinetiq-local-server-0', 'crictl', 'pull', sidecar]);
kubectl(['wait', '--for=condition=Ready', 'certificate', '--all', '-n', 'cnpg-system', '--timeout=120s']);
const deployments = JSON.parse(kubectl(['get', 'deployment', '-A', '-o', 'json'], capture));
for (const deployment of deployments.items.filter(item => ['cert-manager', 'cnpg-system'].includes(item.metadata.namespace))) {
  for (const container of deployment.spec.template.spec.containers) {
    if (!container.image.includes('@sha256:')) throw new Error('Operator image is not pinned');
  }
}
console.log('Pinned certificate, database and backup operators ready (896 MiB total operator limits).');

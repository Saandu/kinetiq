import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simulationFleet } from '@kinetiq/contracts';
import { root, toolDirectory } from './setup-k8s-tools.mjs';
import { apply, assertLocalCluster, kubectl, namespace, capture } from './local-kubernetes.mjs';

assertLocalCluster();
const file = path.join(toolDirectory, 'secrets/mqtt.json');
let passwords;
try { passwords = JSON.parse(await readFile(file, 'utf8')); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  if (kubectl(['get', 'secret', 'kinetiq-mqtt-device', '-n', namespace, '--ignore-not-found', '-o', 'name'], capture).trim()) {
    throw new Error('Recover the ignored MQTT credential file instead of replacing existing identities');
  }
  passwords = { device: randomBytes(32).toString('hex'), bridge: randomBytes(32).toString('hex') };
  await writeFile(file, JSON.stringify(passwords), { mode: 0o600, flag: 'wx' });
}
if (Object.keys(passwords).sort().join() !== 'bridge,device' || Object.values(passwords).some(value => !/^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid MQTT credential file');
const site = '11111111-1111-4111-8111-111111111112';
const acl = ['user bridge\ntopic read kinetiq/+/+/telemetry', ...simulationFleet(12).map(({ id }) => `user ${id}\ntopic write kinetiq/${site}/${id}/telemetry`)].join('\n\n') + '\n';
const metadata = name => ({ name, namespace });
const labels = { 'app.kubernetes.io/instance': 'kinetiq', 'app.kubernetes.io/component': 'mosquitto' };
const config = {
  'mosquitto.conf': await readFile(path.join(root, 'infra/local/mosquitto.conf'), 'utf8'),
  'start.sh': await readFile(path.join(root, 'infra/k8s/local/start-mosquitto.sh'), 'utf8'),
};
const checksum = createHash('sha256').update(JSON.stringify({ config, acl, passwords })).digest('hex');
apply(Object.entries(passwords).map(([role, password]) => ({ apiVersion: 'v1', kind: 'Secret', metadata: metadata(`kinetiq-mqtt-${role}`),
  data: Object.fromEntries(Object.entries({ password, ...(role === 'bridge' ? { acl } : {}) }).map(([key, value]) => [key, Buffer.from(value).toString('base64')])) })));
apply([
  { apiVersion: 'v1', kind: 'ConfigMap', metadata: metadata('kinetiq-mosquitto'), data: config },
  { apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: metadata('kinetiq-mosquitto-data'),
    spec: { accessModes: ['ReadWriteOnce'], storageClassName: 'local-path', resources: { requests: { storage: '1Gi' } } } },
  { apiVersion: 'apps/v1', kind: 'Deployment', metadata: metadata('mosquitto'), spec: {
    replicas: 1, strategy: { type: 'Recreate' }, selector: { matchLabels: labels }, template: { metadata: { labels, annotations: { 'checksum/config': checksum } }, spec: {
      automountServiceAccountToken: false,
      securityContext: { runAsNonRoot: true, runAsUser: 1883, runAsGroup: 1883, fsGroup: 1883, seccompProfile: { type: 'RuntimeDefault' } },
      containers: [{ name: 'mosquitto',
        image: 'eclipse-mosquitto:2.1.2-alpine@sha256:38c0da4f2ef84284d47b3b3eeea1cb3bdeabe81ee10caf0cd5c5ff61ee3ea408',
        command: ['sh', '/config/start.sh'], ports: [{ name: 'mqtt', containerPort: 1883 }],
        securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
        resources: { requests: { cpu: '25m', memory: '16Mi' }, limits: { cpu: '250m', memory: '64Mi' } },
        startupProbe: { tcpSocket: { port: 'mqtt' }, periodSeconds: 5, failureThreshold: 24 },
        readinessProbe: { tcpSocket: { port: 'mqtt' }, periodSeconds: 5 },
        livenessProbe: { tcpSocket: { port: 'mqtt' }, periodSeconds: 10 },
        volumeMounts: [{ name: 'config', mountPath: '/config', readOnly: true }, { name: 'tmp', mountPath: '/tmp' },
          { name: 'data', mountPath: '/mosquitto/data' },
          ...['device', 'bridge'].map(role => ({ name: role, mountPath: `/secrets/${role}`, readOnly: true }))],
      }],
      volumes: [{ name: 'config', configMap: { name: 'kinetiq-mosquitto' } }, { name: 'tmp', emptyDir: { sizeLimit: '64Mi' } },
        { name: 'data', persistentVolumeClaim: { claimName: 'kinetiq-mosquitto-data' } },
        ...['device', 'bridge'].map(role => ({ name: role, secret: { secretName: `kinetiq-mqtt-${role}`, defaultMode: 288 } }))],
    } } } },
  { apiVersion: 'v1', kind: 'Service', metadata: metadata('mosquitto'), spec: { selector: labels, ports: [{ name: 'mqtt', port: 1883, targetPort: 'mqtt' }] } },
  { apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: metadata('mosquitto-boundary'), spec: {
    podSelector: { matchLabels: labels }, policyTypes: ['Ingress', 'Egress'], egress: [], ingress: [{ from: [
      { podSelector: { matchLabels: { 'app.kubernetes.io/instance': 'kinetiq', 'app.kubernetes.io/component': 'simulator' } } },
      { podSelector: { matchLabels: { 'app.kubernetes.io/instance': 'kinetiq', 'app.kubernetes.io/component': 'local-bridge' } } },
    ], ports: [{ protocol: 'TCP', port: 1883 }] }],
  } },
]);
kubectl(['rollout', 'status', 'deployment/mosquitto', '-n', namespace, '--timeout=120s']);
console.log('Authenticated non-root broker ready; persistent data and device ACLs configured.');

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import YAML from 'yaml';
import { root, toolDirectory } from './setup-k8s-tools.mjs';
import { apply, assertLocalCluster, kubectl, namespace, capture, get } from './local-kubernetes.mjs';

assertLocalCluster();
const started = Date.now();
const suffix = Date.now().toString(36);
const security = { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } };
apply([{ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'kinetiq-db-check', namespace },
  data: { 'verify-database.mjs': await readFile(path.join(root, 'infra/k8s/local/verify-database.mjs'), 'utf8') } }]);
async function check(host, initialize, name) {
  // An additional local DNS alias is deliberately absent from the server certificate.
  apply([{ apiVersion: 'v1', kind: 'Service', metadata: { name: host.replace(/-rw$/, '-tls-mismatch'), namespace },
    spec: { type: 'ExternalName', externalName: `${host}.${namespace}.svc.cluster.local`,
      ports: [{ port: 5432, targetPort: 5432 }] } }]);
  const job = {
    apiVersion: 'batch/v1', kind: 'Job', metadata: { name, namespace },
    spec: { backoffLimit: 0, activeDeadlineSeconds: 120, ttlSecondsAfterFinished: 3600,
      template: { metadata: { labels: { 'app.kubernetes.io/component': 'database-check' } }, spec: {
        automountServiceAccountToken: false, restartPolicy: 'Never',
        securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
        containers: [{ name: 'check', image: 'kinetiq-api:local', imagePullPolicy: 'Never',
          command: ['node', '/app/infra/k8s/verify-database.mjs'], securityContext: security,
          resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { cpu: '1', memory: '256Mi' } },
          env: [{ name: 'DB_HOST', value: host }, { name: 'DB_INITIALIZE', value: String(initialize) }, { name: 'DB_TLS', value: 'true' }],
          volumeMounts: [{ name: 'script', mountPath: '/app/infra/k8s', readOnly: true },
            { name: 'ca', mountPath: '/secrets/ca', readOnly: true },
            ...['admin', 'api', 'ingest'].map(role => ({ name: role, mountPath: `/secrets/${role}`, readOnly: true }))],
        }],
        volumes: [{ name: 'script', configMap: { name: 'kinetiq-db-check' } },
          { name: 'ca', secret: { secretName: host.replace(/-rw$/, '-ca'), items: [{ key: 'ca.crt', path: 'ca.crt' }], defaultMode: 288 } },
          ...['admin', 'api', 'ingest'].map(role => ({ name: role, secret: { secretName: `kinetiq-db-${role}`, defaultMode: 288 } }))],
      } } },
  };
  apply([job]);
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = get('job', name).status;
    if (status.succeeded) {
      const output = kubectl(['logs', `job/${name}`, '-n', namespace], capture).trim();
      return JSON.parse(output.split(/\r?\n/).at(-1));
    }
    if (status.failed) {
      kubectl(['logs', `job/${name}`, '-n', namespace]);
      throw new Error(`${name} failed`);
    }
    await delay(2000);
  }
  throw new Error(`${name} timed out`);
}
const source = await check('kinetiq-db-rw', true, `db-initialize-${suffix}`);
console.log(`Source database passed ${source.checks}; ${source.rows} persisted readings.`);
const backupStarted = Date.now();
const backup = `kinetiq-drill-${suffix}`;
apply([{ apiVersion: 'postgresql.cnpg.io/v1', kind: 'Backup', metadata: { name: backup, namespace },
  spec: { cluster: { name: 'kinetiq-db' }, method: 'plugin', pluginConfiguration: { name: 'barman-cloud.cloudnative-pg.io' } } }]);
let completed = false;
for (let attempt = 0; attempt < 180; attempt++) {
  const status = get('backup', backup).status;
  if (status?.phase === 'completed') { completed = true; break; }
  if (status?.phase === 'failed') throw new Error(`Backup failed: ${status.error ?? 'inspect the Backup status'}`);
  await delay(2000);
}
assert.ok(completed, 'S3 base backup must complete before any recovery test');
const backedUpAt = Date.now();
function backupObjects() {
  const output = kubectl(['exec', 'deployment/localstack', '-n', namespace, '--',
    'awslocal', 's3api', 'list-objects-v2', '--bucket', 'kinetiq-backups', '--prefix', 'kinetiq-db/'], capture);
  return JSON.parse(output).Contents?.map(object => object.Key).sort() ?? [];
}
const keys = backupObjects();
assert.ok(keys.some(key => key.includes('/base/')) && keys.some(key => key.includes('/wals/')),
  'Object storage must contain a base backup and archived WAL');
// Hobby LocalStack S3 is ephemeral. This drill proves PostgreSQL recovery through
// the S3 API while the emulator runs, not emulator durability or host-loss safety.
const restoreStarted = Date.now();
// Re-running always starts with a new, disposable restore volume. Never touch the source PVC.
kubectl(['delete', 'cluster', 'kinetiq-db-restore', '-n', namespace, '--ignore-not-found', '--wait=true', '--timeout=60s']);
kubectl(['delete', 'pvc', '-l', 'cnpg.io/cluster=kinetiq-db-restore', '-n', namespace, '--wait=true', '--timeout=60s']);
const restore = YAML.parse(await readFile(path.join(root, 'infra/k8s/local/database-restore.yaml'), 'utf8'));
apply([restore]);
kubectl(['wait', '--for=condition=Ready', 'cluster/kinetiq-db-restore', '-n', namespace, '--timeout=300s']);
const recovered = await check('kinetiq-db-restore-rw', false, `db-restore-check-${suffix}`);
assert.deepEqual(recovered, source, 'Restore must recover identical readings, schema and tenant boundaries');
const restoredAt = Date.now();
const pvcList = () => JSON.parse(kubectl(['get', 'pvc', '-n', namespace, '-o', 'json'], capture)).items;
const sourcePVC = pvcList().find(pvc => pvc.metadata.labels?.['cnpg.io/cluster'] === 'kinetiq-db');
const restorePVC = pvcList().find(pvc => pvc.metadata.labels?.['cnpg.io/cluster'] === 'kinetiq-db-restore');
assert.ok(sourcePVC && restorePVC);
assert.notEqual(sourcePVC.spec.volumeName, restorePVC.spec.volumeName, 'Recovery must use a different persistent volume');
// Separately exercise retained-volume recovery by replacing only the source database Pod.
const before = get('cluster', 'kinetiq-db').status.currentPrimary;
kubectl(['delete', 'pod', before, '-n', namespace, '--wait=true', '--timeout=60s']);
kubectl(['wait', '--for=create', `pod/${before}`, '-n', namespace, '--timeout=120s']);
kubectl(['wait', '--for=condition=Ready', `pod/${before}`, '-n', namespace, '--timeout=180s']);
const retained = await check('kinetiq-db-rw', false, `db-retained-check-${suffix}`);
assert.deepEqual(retained, source);
assert.equal(pvcList().find(pvc => pvc.metadata.name === sourcePVC.metadata.name)?.metadata.uid, sourcePVC.metadata.uid);
const report = { verifiedAt: new Date().toISOString(), source, backupSeconds: (backedUpAt - backupStarted) / 1000,
  backupObjects: keys.length, objectStoreDurability: 'ephemeral local emulator; independent cloud S3 pending Phase 2',
  restoreSeconds: (restoredAt - restoreStarted) / 1000, totalSeconds: (Date.now() - started) / 1000,
  sourceVolume: sourcePVC.spec.volumeName, restoreVolume: restorePVC.spec.volumeName };
await writeFile(path.join(toolDirectory, 'database-recovery-report.json'), JSON.stringify(report, null, 2));
// Leave the source and backup intact; the disposable restore need not keep using laptop RAM.
kubectl(['delete', 'cluster', 'kinetiq-db-restore', '-n', namespace, '--wait=true', '--timeout=60s']);
kubectl(['delete', 'pvc', '-l', 'cnpg.io/cluster=kinetiq-db-restore', '-n', namespace, '--wait=true', '--timeout=60s']);
console.log(`Recovery verified: identical data on a fresh S3-restored volume, then on the retained source volume. Restore ${report.restoreSeconds.toFixed(1)}s.`);

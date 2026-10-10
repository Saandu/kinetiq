import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { apply, assertLocalCluster, get, kubectl, namespace, capture } from './local-kubernetes.mjs';

assertLocalCluster();
const scaled = get('scaledobject', 'kinetiq-ingest');
assert.equal(scaled.spec.minReplicaCount, 1); assert.equal(scaled.spec.maxReplicaCount, 3);
assert.equal(scaled.spec.triggers[0].metadata.awsEndpoint, 'http://localstack.kinetiq-local.svc.cluster.local:4566');
// Fractional timestamps avoid the simulator's whole-ten-second timestamps.
const start = Math.floor((Date.now() - 3600_000) / 1000) * 1000 + 333;
const suffix = String(Date.now());
const configName = `kinetiq-load-${suffix}`;
const jobs = ['lock', 'burst'].map(mode => `kinetiq-load-${mode}-${suffix}`);
const query = sql => kubectl(['exec', 'kinetiq-db-1', '-c', 'postgres', '-n', namespace, '--', 'psql', '-U', 'postgres', '-d', 'kinetiq', '-Atc', sql], capture).trim();
const logs = name => kubectl(['logs', `job/${name}`, '-n', namespace], capture);
const job = (mode, name) => ({ apiVersion: 'batch/v1', kind: 'Job', metadata: { name, namespace }, spec: {
  backoffLimit: 0, activeDeadlineSeconds: 150, ttlSecondsAfterFinished: 600,
  template: { metadata: { labels: { 'app.kubernetes.io/instance': 'kinetiq', 'app.kubernetes.io/component': mode === 'lock' ? 'migrations' : 'queues' } }, spec: {
    restartPolicy: 'Never', automountServiceAccountToken: false,
    securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
    containers: [{ name: 'check', image: 'kinetiq-api:local', imagePullPolicy: 'Never', command: ['node', '/app/infra/k8s/load.mjs'],
      env: [{ name: 'CHECK_MODE', value: mode }, { name: 'FIXTURE_START', value: String(start) }, { name: 'DATABASE_CA_FILE', value: '/secrets/ca/ca.crt' }],
      resources: { requests: { cpu: '25m', memory: '64Mi' }, limits: { cpu: '500m', memory: '256Mi' } },
      securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
      volumeMounts: [{ name: 'code', mountPath: '/app/infra/k8s', readOnly: true }, ...(mode === 'lock' ?
        [{ name: 'admin', mountPath: '/secrets/admin', readOnly: true }, { name: 'ca', mountPath: '/secrets/ca', readOnly: true }] : [])],
    }], volumes: [{ name: 'code', configMap: { name: configName } }, ...(mode === 'lock' ?
      [{ name: 'admin', secret: { secretName: 'kinetiq-db-admin', defaultMode: 288 } }, { name: 'ca', secret: { secretName: 'kinetiq-db-ca', defaultMode: 288, items: [{ key: 'ca.crt', path: 'ca.crt' }] } }] : [])],
  } },
} });
let peak = 1;
const fixturePredicate = `machine_id='DEMO-CNC-01' AND ts >= to_timestamp(${start}/1000.0) AND ts <= to_timestamp(${start + 199}/1000.0)`;
assert.equal(query(`SELECT count(*) FROM kinetiq.telemetry WHERE ${fixturePredicate}`), '0', 'Fixture timestamps must be unused');
try {
  apply([{ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: configName, namespace }, data: { 'load.mjs': await readFile('infra/k8s/local/load-scaling.mjs', 'utf8') } }, job('lock', jobs[0])]);
  let acquired = false;
  for (let i = 0; i < 30; i++) {
    const pod = JSON.parse(kubectl(['get', 'pods', '-n', namespace, '-l', `job-name=${jobs[0]}`, '-o', 'json'], capture)).items[0];
    if (pod?.status.phase === 'Running' && logs(jobs[0]).includes('lock acquired')) { acquired = true; break; }
    await wait(1000);
  }
  assert.ok(acquired, 'The bounded write lock must start before queue production');
  apply([job('burst', jobs[1])]);
  // Readiness can stay false during database retries; observe recovery after the 70s lock.
  for (let i = 0; i < 100; i++) {
    const deploy = get('deployment', 'kinetiq-ingest');
    assert.ok(deploy.spec.replicas >= 1 && deploy.spec.replicas <= 3);
    peak = Math.max(peak, deploy.status.readyReplicas ?? 0);
    if (peak === 3) break;
    await wait(1000);
  }
  assert.equal(peak, 3, 'Queue backlog must cause three ready workers');
  assert.equal((await fetch('http://127.0.0.1:3102/v1/machines')).status, 200, 'API reads stay available during the write lock');
  for (const name of jobs) kubectl(['wait', `job/${name}`, '-n', namespace, '--for=condition=complete', '--timeout=120s']);
  let rows = 0;
  for (let i = 0; i < 90; i++) {
    rows = Number(query(`SELECT count(*) FROM kinetiq.telemetry WHERE ${fixturePredicate}`));
    const deploy = get('deployment', 'kinetiq-ingest');
    if (rows === 200 && deploy.spec.replicas === 1 && deploy.status.replicas === 1 && deploy.status.readyReplicas === 1) break;
    await wait(2000);
  }
  assert.equal(rows, 200, 'Every fixture must commit exactly once');
  assert.equal(get('deployment', 'kinetiq-ingest').spec.replicas, 1, 'Workers must scale back to one');
  assert.equal(get('deployment', 'kinetiq-ingest').status.readyReplicas, 1);
  assert.equal(query(`DELETE FROM kinetiq.telemetry WHERE ${fixturePredicate}`), 'DELETE 200', 'Remove only this completed drill fixture');
  console.log('Bounded scaling passed: 200 valid messages at ≤20/s, 1→3 ready workers→1, exactly 200 rows, API readable during the 70-second device-write lock.');
} finally {
  // Deleting the lock Pod closes the connection and releases the transaction on any failure.
  for (const name of jobs) kubectl(['delete', 'job', name, '-n', namespace, '--ignore-not-found', '--wait=true']);
  kubectl(['delete', 'configmap', configName, '-n', namespace, '--ignore-not-found']);
}

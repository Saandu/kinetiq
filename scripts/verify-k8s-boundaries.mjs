import { readFile } from 'node:fs/promises';
import { apply, assertLocalCluster, kubectl, namespace, capture } from './local-kubernetes.mjs';

assertLocalCluster();
const config = `kinetiq-boundaries-${Date.now()}`;
apply([{ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: config, namespace },
  data: { 'check.mjs': await readFile('infra/k8s/local/check-boundaries.mjs', 'utf8') } }]);
try {
  for (const mode of ['mqtt', 'untrusted']) {
    const name = `${config}-${mode}`;
    try {
      apply([{ apiVersion: 'batch/v1', kind: 'Job', metadata: { name, namespace }, spec: {
        backoffLimit: 0, activeDeadlineSeconds: 60,
        template: { metadata: { labels: { 'app.kubernetes.io/instance': 'kinetiq',
          'app.kubernetes.io/component': mode === 'mqtt' ? 'local-bridge' : 'boundary-check' } }, spec: {
          restartPolicy: 'Never', automountServiceAccountToken: false,
          securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
          containers: [{ name: 'check', image: 'kinetiq-local-bridge:local', imagePullPolicy: 'Never', command: ['node', '/app/infra/k8s/check.mjs'],
            env: [{ name: 'CHECK_MODE', value: mode }],
            securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
            resources: { requests: { cpu: '25m', memory: '32Mi' }, limits: { cpu: '250m', memory: '128Mi' } },
            volumeMounts: [{ name: 'code', mountPath: '/app/infra/k8s', readOnly: true },
              ...(mode === 'mqtt' ? [{ name: 'device', mountPath: '/secrets/device', readOnly: true }] : [])],
          }], volumes: [{ name: 'code', configMap: { name: config } },
            ...(mode === 'mqtt' ? [{ name: 'device', secret: { secretName: 'kinetiq-mqtt-device', defaultMode: 288 } }] : [])],
        } },
      } }]);
      kubectl(['wait', `job/${name}`, '-n', namespace, '--for=condition=complete', '--timeout=65s']);
      console.log(kubectl(['logs', `job/${name}`, '-n', namespace], capture).trim());
    } finally { kubectl(['delete', 'job', name, '-n', namespace, '--ignore-not-found', '--wait=true']); }
  }
} finally { kubectl(['delete', 'configmap', config, '-n', namespace, '--ignore-not-found']); }

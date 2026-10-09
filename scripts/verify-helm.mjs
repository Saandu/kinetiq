import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseAllDocuments } from 'yaml';
import { root, toolDirectory, tool, run } from './setup-k8s-tools.mjs';

const chart = path.join(root, 'infra/helm/kinetiq');
const output = path.join(toolDirectory, 'helm');
const cache = path.join(toolDirectory, 'schema-cache');
// Immutable registry snapshot: no fallback to master or skipped schemas.
const schemaCommit = '5f1fa4f7908afc9b6641c62d282a4a22437626e1';
const schemaLocation = `https://raw.githubusercontent.com/yannh/kubernetes-json-schema/${schemaCommit}/{{.NormalizedKubernetesVersion}}-standalone{{.StrictSuffix}}/{{.ResourceKind}}{{.KindSuffix}}.json`;
const names = ['api', 'ingest', 'local-bridge', 'simulator', 'web'];
const release = 'kinetiq';
const routes = { web: {api: 8080}, api: {postgres: 5432}, ingest: {postgres: 5432, localstack: 4566},
  'local-bridge': {mosquitto: 1883, localstack: 4566}, simulator: {mosquitto: 1883}, migrations: {postgres: 5432}, queues: {localstack: 4566} };
const capture = { stdio: 'pipe' };
const mi = (value) => { assert.match(value, /^[1-9][0-9]*Mi$/); return Number(value.slice(0, -2)); };
const cpu = (value) => { assert.match(value, /^[1-9][0-9]*m$/); return Number(value.slice(0, -1)); };
function parse(text) {
  return parseAllDocuments(text, { uniqueKeys: true }).map((document) => {
    assert.equal(document.errors.length, 0, document.errors.map((e) => e.message).join('\n'));
    return document.toJS();
  }).filter(Boolean);
}
function validate(objects, budgetMi) {
  const identities = new Set();
  for (const object of objects) {
    const identity = `${object.kind}/${object.metadata.name}`;
    assert.ok(!identities.has(identity), `Duplicate ${identity}`); identities.add(identity);
    assert.notEqual(object.kind, 'Secret', 'Credentials must be provisioned outside Helm');
    assert.ok(!['Role', 'ClusterRole', 'RoleBinding', 'ClusterRoleBinding'].includes(object.kind), 'Application requires no Kubernetes API privileges');
    if (object.kind === 'ConfigMap') {
      for (const key of Object.keys(object.data)) assert.ok(!/^(DATABASE_URL|.*PASSWORD|.*AUTH_TOKEN)$/.test(key), 'Secret value in ConfigMap');
    }
    if (object.kind === 'Service') assert.ok(['ClusterIP', 'ExternalName'].includes(object.spec.type), 'No public or node ports');
  }
  const find = (kind, name) => { const item = objects.find((o) => o.kind === kind && o.metadata.name === name); assert.ok(item, `Missing ${kind}/${name}`); return item; };
  const podObjects = objects.filter((o) => ['Deployment', 'Job'].includes(o.kind));
  let steadyMi = 0; let surgeMi = 0; let jobMi = 0;
  for (const object of podObjects) {
    const spec = object.spec.template.spec;
    const component = object.spec.template.metadata.labels['app.kubernetes.io/component'];
    assert.equal(spec.automountServiceAccountToken, false);
    assert.equal(find('ServiceAccount', spec.serviceAccountName).automountServiceAccountToken, false);
    assert.equal(spec.securityContext.runAsNonRoot, true);
    assert.equal(spec.securityContext.runAsUser, component === 'web' ? 101 : 1000);
    assert.equal(spec.securityContext.seccompProfile.type, 'RuntimeDefault');
    assert.equal(spec.hostNetwork, undefined); assert.equal(spec.hostPID, undefined);
    assert.equal(spec.containers.length, 1);
    assert.ok(!spec.volumes.some((volume) => volume.hostPath));
    const container = spec.containers[0];
    assert.equal(container.securityContext.allowPrivilegeEscalation, false);
    assert.equal(container.securityContext.readOnlyRootFilesystem, true);
    assert.deepEqual(container.securityContext.capabilities.drop, ['ALL']);
    assert.ok(!container.image.endsWith(':latest'));
    assert.ok(['Never', 'IfNotPresent'].includes(container.imagePullPolicy));
    const limitMi = mi(container.resources.limits.memory);
    assert.ok(mi(container.resources.requests.memory) <= limitMi);
    assert.ok(cpu(container.resources.requests.cpu) <= cpu(container.resources.limits.cpu));
    const tmp = spec.volumes.find((v) => v.name === 'tmp');
    assert.equal(tmp.emptyDir.sizeLimit, '64Mi');
    for (const mount of container.volumeMounts.filter((m) => m.name !== 'tmp')) assert.equal(mount.readOnly, true);
    if (component !== 'migrations') assert.ok(!JSON.stringify(spec.volumes).includes('kinetiq-db-admin'), 'Admin credential exposed to runtime');
    if (object.kind === 'Deployment') {
      assert.ok(names.includes(component));
      if (['simulator', 'local-bridge'].includes(component)) {
        assert.equal(object.spec.strategy.type, 'Recreate');
        assert.equal(object.spec.replicas, 1);
      } else {
        assert.equal(object.spec.strategy.rollingUpdate.maxSurge, 1);
        assert.equal(object.spec.strategy.rollingUpdate.maxUnavailable, 0);
        surgeMi += limitMi;
      }
      steadyMi += limitMi * object.spec.replicas;
      for (const probe of ['startupProbe', 'livenessProbe', 'readinessProbe']) assert.ok(container[probe]);
      assert.equal(container.livenessProbe.httpGet.path, component === 'web' ? '/healthz' : '/health/live');
      assert.equal(container.readinessProbe.httpGet.path, component === 'web' ? '/healthz' : '/health/ready');
      assert.equal(object.spec.template.metadata.annotations['checksum/config'].length, 64);
      assert.deepEqual(object.spec.selector.matchLabels, {
        'app.kubernetes.io/instance': release, 'app.kubernetes.io/component': component,
      });
    } else {
      jobMi += limitMi;
      assert.equal(object.spec.activeDeadlineSeconds, 600);
      assert.equal(object.spec.backoffLimit, 6);
      assert.equal(spec.restartPolicy, 'OnFailure');
    }
  }
  for (const name of names) find('Deployment', `${release}-${name}`);
  const totalMi = steadyMi + surgeMi + jobMi;
  assert.ok(totalMi <= budgetMi, `Memory budget exceeded: ${totalMi} MiB > ${budgetMi} MiB (includes rolling surges and setup Jobs)`);
  for (const name of ['api', 'web']) {
    assert.deepEqual(find('Service', name).spec.selector, find('Deployment', `${release}-${name}`).spec.selector.matchLabels);
  }
  const deny = find('NetworkPolicy', `${release}-default-deny`).spec;
  assert.deepEqual(deny.policyTypes, ['Ingress', 'Egress']);
  assert.deepEqual(deny.podSelector.matchLabels, {'app.kubernetes.io/instance': release});
  assert.deepEqual(deny.ingress, []); assert.deepEqual(deny.egress, []);
  const dns = find('NetworkPolicy', `${release}-dns`).spec.egress;
  assert.equal(dns.length, 1);
  assert.deepEqual(dns[0].to, [{namespaceSelector: {matchLabels: {'kubernetes.io/metadata.name': 'kube-system'}}, podSelector: {matchLabels: {'k8s-app': 'kube-dns'}}}]);
  assert.deepEqual(dns[0].ports, [{protocol: 'UDP', port: 53}, {protocol: 'TCP', port: 53}]);
  for (const [source, destinations] of Object.entries(routes)) {
    const policy = find('NetworkPolicy', `${release}-${source}-egress`).spec;
    assert.equal(policy.podSelector.matchLabels['app.kubernetes.io/component'], source);
    assert.equal(policy.egress.length, Object.keys(destinations).length);
    for (const rule of policy.egress) {
      assert.equal(rule.to.length, 1); assert.equal(rule.ports.length, 1);
      const labels = rule.to[0].podSelector?.matchLabels;
      const target = labels?.['cnpg.io/cluster'] ? 'postgres' : labels?.['app.kubernetes.io/component'];
      assert.ok(target in destinations);
      assert.deepEqual(rule.ports[0], {protocol: 'TCP', port: destinations[target]});
      assert.equal(rule.to[0].namespaceSelector, undefined);
      assert.equal(rule.to[0].ipBlock, undefined);
      if (target !== 'postgres') assert.equal(labels['app.kubernetes.io/instance'], release);
    }
  }
  const allowedPolicies = new Set(['default-deny', 'dns', 'web-ingress', 'api-ingress', ...Object.keys(routes).map((name) => `${name}-egress`)].map((name) => `${release}-${name}`));
  const policies = objects.filter((o) => o.kind === 'NetworkPolicy');
  assert.equal(policies.length, allowedPolicies.size);
  for (const policy of policies) assert.ok(allowedPolicies.has(policy.metadata.name));
  assert.deepEqual(find('NetworkPolicy', `${release}-api-ingress`).spec.ingress, [{from: [{podSelector: {matchLabels: {'app.kubernetes.io/instance': release, 'app.kubernetes.io/component': 'web'}}}], ports: [{protocol: 'TCP', port: 8080}]}]);
  assert.deepEqual(find('NetworkPolicy', `${release}-web-ingress`).spec.ingress, [{from: [{namespaceSelector: {matchLabels: {'kubernetes.io/metadata.name': 'kube-system'}}, podSelector: {matchLabels: {'app.kubernetes.io/name': 'traefik'}}}], ports: [{protocol: 'TCP', port: 8080}]}]);
  return {steadyMi, surgeMi, jobMi, totalMi};
}

await mkdir(output, {recursive: true}); await mkdir(cache, {recursive: true});
for (const profile of ['local', 'ci']) {
  const values = path.join(chart, profile, 'values.yaml');
  run(tool('helm'), ['lint', chart, '--strict', '-f', values, '--kube-version', '1.36.5']);
  const rendered = run(tool('helm'), ['template', release, chart, '-f', values, '--namespace', `kinetiq-${profile}`, '--kube-version', '1.36.5'], capture);
  const file = path.join(output, `${profile}.yaml`); await writeFile(file, rendered);
  run(tool('kubeconform'), ['-strict', '-summary', '-kubernetes-version', '1.36.5', '-schema-location', schemaLocation, '-cache', cache, file]);
  const objects = parse(rendered);
  const report = validate(objects, 2560);
  console.log(`${profile}: ${objects.length} objects; memory ${JSON.stringify(report)} MiB`);
  // Regression gates deliberately exercise unsafe changes rather than only happy paths.
  for (const mutation of [
    (list) => list.push({kind: 'Secret', metadata: {name: 'leaked'}, data: {password: 'example'}}),
    (list) => { list.find((o) => o.kind === 'Service' && o.metadata.name === 'api').spec.type = 'LoadBalancer'; },
    (list) => { list.find((o) => o.kind === 'Deployment').spec.template.spec.containers[0].resources.limits.memory = '4096Mi'; },
    (list) => { list.find((o) => o.kind === 'NetworkPolicy' && o.metadata.name.endsWith('default-deny')).spec.egress = [{}]; },
    (list) => { list.find((o) => o.kind === 'Deployment').spec.template.spec.automountServiceAccountToken = true; },
  ]) {
    const unsafe = structuredClone(objects); mutation(unsafe);
    assert.throws(() => validate(unsafe, 2560), 'Unsafe manifest unexpectedly passed');
  }
}
for (const override of ['components.api.uid=0', 'secrets.apiPassword=bad', 'environment=prod', 'components.simulator.replicas=2', 'components.api.image=kinetiq-api:latest']) {
  const result = spawnSync(tool('helm'), ['template', release, chart, '--kube-version', '1.36.5', '--set', override], {cwd: root, encoding: 'utf8'});
  assert.notEqual(result.status, 0, `Unsafe values accepted: ${override}`);
  assert.match(result.stderr, /schema/);
}
const tooSmall = spawnSync(tool('helm'), ['template', release, chart, '--kube-version', '1.36.5', '--set', 'budgetMi=1024'], {cwd: root, encoding: 'utf8'});
assert.notEqual(tooSmall.status, 0); assert.match(tooSmall.stderr, /memory budget exceeded/);
const sharedAdmin = spawnSync(tool('helm'), ['template', release, chart, '--kube-version', '1.36.5', '--set', 'secrets.api=kinetiq-db-admin'], {cwd: root, encoding: 'utf8'});
assert.notEqual(sharedAdmin.status, 0); assert.match(sharedAdmin.stderr, /Secret references must be distinct/);
console.log('Both profiles, strict Kubernetes schemas and 17 unsafe-change regression checks passed. No cluster access required.');

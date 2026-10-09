import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, kubeconfig, run, tool, verifyTools } from './setup-k8s-tools.mjs';

const cluster = 'kinetiq-local';
const server = `k3d-${cluster}-server-0`;
const images = ['simulator', 'local-bridge', 'ingest', 'api', 'web']
  .map((name) => `kinetiq-${name}:local`).concat('kinetiq-postgres:18.6-1');
const k3d = (args, options) => run(tool('k3d'), args, options);
const kubectl = (args, options) => run(tool('kubectl'), ['--kubeconfig', kubeconfig, ...args], options);
const capture = { stdio: 'pipe' };

async function saveConfig() {
  const config = k3d(['kubeconfig', 'get', cluster], capture);
  await writeFile(kubeconfig, config, { mode: 0o600 });
}
function assertContext() {
  const config = JSON.parse(kubectl(['config', 'view', '-o', 'json'], capture));
  if (config['current-context'] !== `k3d-${cluster}` ||
      config.clusters.length !== 1 ||
      config.clusters[0].cluster.server !== 'https://127.0.0.1:16550') {
    throw new Error('Refusing command: kubeconfig is not the isolated local cluster');
  }
}
function verify() {
  assertContext();
  kubectl(['wait', '--for=condition=Ready', 'node', '--all', '--timeout=180s']);
  for (const deployment of ['coredns', 'metrics-server', 'traefik', 'local-path-provisioner']) {
    kubectl(['wait', '--for=create', `deployment/${deployment}`, '-n', 'kube-system', '--timeout=180s']);
    kubectl(['rollout', 'status', `deployment/${deployment}`, '-n', 'kube-system', '--timeout=180s']);
  }
  const nodes = JSON.parse(kubectl(['get', 'nodes', '-o', 'json'], capture));
  if (nodes.items.length !== 1 || nodes.items[0].status.nodeInfo.kubeletVersion !== 'v1.36.5+k3s1') {
    throw new Error('Unexpected node count or Kubernetes version');
  }
  const ports = JSON.parse(run('docker', ['inspect', `k3d-${cluster}-serverlb`], capture))[0].NetworkSettings.Ports;
  for (const port of ['6443/tcp', '80/tcp']) {
    if (ports[port]?.length !== 1 || ports[port][0].HostIp !== '127.0.0.1') {
      throw new Error(`Cluster port ${port} is not confined to loopback`);
    }
  }
  const memory = JSON.parse(run('docker', ['inspect', server], capture))[0].HostConfig.Memory;
  if (memory !== 8 * 1024 ** 3) throw new Error('Cluster node memory cap must be 8 GiB');
  kubectl(['get', 'nodes', '-o', 'wide']);
  kubectl(['get', 'pods', '-A']);
  run('docker', ['stats', '--no-stream', server, `k3d-${cluster}-serverlb`]);
  console.log('Local cluster foundation verified. Application deployment is a separate step.');
}
function verifyImages() {
  const imported = run('docker', ['exec', server, 'ctr', '--address',
    '/run/k3s/containerd/containerd.sock', '--namespace', 'k8s.io', 'images', 'list', '-q'], capture);
  for (const image of images) {
    if (!imported.split(/\r?\n/).includes(`docker.io/library/${image}`)) {
      throw new Error(`Missing imported image: ${image}`);
    }
  }
  console.log(`Verified ${images.length} local images in the Kubernetes container runtime.`);
}
const action = process.argv[2];
switch (action) {
  case 'up': {
    verifyTools();
    const existing = JSON.parse(k3d(['cluster', 'list', '-o', 'json'], capture));
    if (existing.some((item) => item.name === cluster)) {
      k3d(['cluster', 'start', cluster, '--wait', '--timeout', '240s']);
    } else {
      k3d(['cluster', 'create', '--config', path.join(root, 'infra/k8s/local/cluster.yaml'), '--servers-memory', '8g']);
    }
    await saveConfig();
    verify();
    break;
  }
  case 'stop':
    k3d(['cluster', 'stop', cluster]);
    break;
  case 'status':
    assertContext();
    kubectl(['get', 'nodes', '-o', 'wide']);
    kubectl(['get', 'pods', '-A']);
    break;
  case 'verify':
    verify();
    break;
  case 'images': {
    assertContext();
    for (const image of images) run('docker', ['image', 'inspect', image], capture);
    k3d(['image', 'import', '--cluster', cluster, ...images]);
    verifyImages();
    break;
  }
  case 'images-verify':
    assertContext();
    verifyImages();
    break;
  case 'kubectl':
    assertContext();
    if (process.argv.slice(3).some((arg) => /^--(kubeconfig|context|server|cluster)(=|$)/.test(arg) || arg === '-s')) {
      throw new Error('Connection overrides are disabled in the local wrapper');
    }
    kubectl(process.argv.slice(3));
    break;
  default:
    throw new Error('Use up, stop, status, verify, images, images-verify or kubectl.');
}

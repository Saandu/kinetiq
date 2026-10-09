import { run, tool, kubeconfig } from './setup-k8s-tools.mjs';

export const namespace = 'kinetiq-local';
export const capture = { stdio: 'pipe' };
export const kubectl = (args, options) => run(tool('kubectl'), ['--kubeconfig', kubeconfig, ...args], options);
export function assertLocalCluster() {
  const config = JSON.parse(kubectl(['config', 'view', '-o', 'json'], capture));
  if (config['current-context'] !== 'k3d-kinetiq-local' || config.clusters.length !== 1 ||
      config.clusters[0].cluster.server !== 'https://127.0.0.1:16550') {
    throw new Error('Refusing operation outside the isolated local cluster');
  }
}
export function apply(objects) {
  // Secrets go through stdin, never command-line arguments or diagnostic output.
  const output = kubectl(['apply', '--server-side', '--field-manager=kinetiq-local-platform', '-f', '-'],
    { ...capture, input: objects.map(object => JSON.stringify(object)).join('\n---\n') });
  console.log(output.trim());
}
export const get = (kind, name) => JSON.parse(kubectl(['get', kind, name, '-n', namespace, '-o', 'json'], capture));

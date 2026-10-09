import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { root, toolDirectory } from './setup-k8s-tools.mjs';
import { apply, assertLocalCluster, kubectl, namespace } from './local-kubernetes.mjs';

assertLocalCluster();
// Only the local process reads the ignored dotenv; the token is never printed.
process.loadEnvFile(path.join(root, '.env.local'));
const token = process.env.LOCALSTACK_AUTH_TOKEN;
if (!token) throw new Error('Set LOCALSTACK_AUTH_TOKEN in the root .env.local');
const directory = path.join(toolDirectory, 'secrets');
await mkdir(directory, { recursive: true });
const file = path.join(directory, 'database.json');
let passwords;
try { passwords = JSON.parse(await readFile(file, 'utf8')); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // Refuse an accidental password reset if local state was lost while the database survives.
  const existing = kubectl(['get', 'secret', 'kinetiq-db-admin', '-n', namespace, '--ignore-not-found', '-o', 'name'], { stdio: 'pipe' });
  if (existing.trim()) {
    throw new Error('Database credentials already exist: recover the ignored credential file before setup');
  }
  passwords = Object.fromEntries(['admin', 'api', 'ingest'].map(role => [role, randomBytes(32).toString('hex')]));
  await writeFile(file, JSON.stringify(passwords), { mode: 0o600, flag: 'wx' });
}
if (Object.keys(passwords).sort().join() !== 'admin,api,ingest' || Object.values(passwords).some(value => !/^[a-f0-9]{64}$/.test(value))) {
  throw new Error('Invalid local credential file');
}
function secret(name, values, type = 'Opaque') {
  return { apiVersion: 'v1', kind: 'Secret', metadata: { name, namespace }, type,
    data: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Buffer.from(value).toString('base64')])) };
}
apply([{ apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } }]);
apply([
  ...Object.entries(passwords).map(([role, password]) => {
    const username = role === 'admin' ? 'postgres' : `kinetiq_${role}`;
    return secret(`kinetiq-db-${role}`, {
      username, password, 'database-url': `postgresql://${username}:${password}@postgres:5432/kinetiq`,
    }, 'kubernetes.io/basic-auth');
  }),
  secret('kinetiq-localstack-auth', { token }),
  // These are intentionally fake local S3 credentials, never AWS access keys.
  secret('kinetiq-backup-s3', { 'access-key': 'test', 'secret-key': 'test', region: 'us-east-1' }),
]);
for (const fileName of ['backup-storage.yaml', 'database.yaml']) {
  const objects = YAML.parseAllDocuments(await readFile(path.join(root, 'infra/k8s/local', fileName), 'utf8')).map(doc => doc.toJSON());
  apply(objects);
}
kubectl(['rollout', 'status', 'deployment/localstack', '-n', namespace, '--timeout=240s']);
kubectl(['wait', '--for=condition=Ready', 'cluster/kinetiq-db', '-n', namespace, '--timeout=300s']);
console.log('Local operator-managed PostgreSQL and S3 emulator ready. Run the database recovery drill next.');

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const toolDirectory = path.join(root, '.tools', 'k8s');
export const binDirectory = path.join(toolDirectory, 'bin');
export const kubeconfig = path.join(toolDirectory, 'kinetiq.kubeconfig');
export const pins = JSON.parse(await readFile(path.join(root, 'infra/k8s/local/tools.json'), 'utf8'));
export function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root, encoding: 'utf8', stdio: 'inherit',
    env: { ...process.env, KUBECONFIG: kubeconfig }, ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(program)} exited with ${result.status}`);
  return result.stdout;
}
export function tool(name) { return path.join(binDirectory, `${name}.exe`); }
const hash = (data) => createHash('sha256').update(data).digest('hex');

export async function install() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('This initial local tool installer supports Windows x64 only.');
  }
  const downloads = path.join(toolDirectory, 'downloads');
  await mkdir(downloads, { recursive: true });
  await mkdir(binDirectory, { recursive: true });
  for (const [name, pin] of Object.entries(pins)) {
    const archive = path.join(downloads, path.basename(new URL(pin.url).pathname));
    let bytes;
    try { bytes = await readFile(archive); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!bytes || hash(bytes) !== pin.sha256) {
      console.log(`Downloading ${name} ${pin.version} to ${downloads}`);
      const response = await fetch(pin.url, { signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(`${name} download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== pin.sha256) throw new Error(`${name} SHA-256 mismatch; refusing installation`);
      await writeFile(`${archive}.partial`, bytes);
      await rename(`${archive}.partial`, archive);
    }
    if (hash(bytes) !== pin.sha256) throw new Error(`${name} SHA-256 mismatch`);
    if (name === 'helm') {
      await mkdir(path.join(toolDirectory, 'helm-extracted'), { recursive: true });
      run('tar.exe', ['-xf', archive, '-C', path.join(toolDirectory, 'helm-extracted'), 'windows-amd64/helm.exe']);
      await copyFile(path.join(toolDirectory, 'helm-extracted/windows-amd64/helm.exe'), tool(name));
    } else {
      await writeFile(tool(name), bytes);
    }
    console.log(`${name}: checksum verified`);
  }
  verifyTools();
}
export function verifyTools() {
  for (const [name, args] of [
    ['k3d', ['version']], ['kubectl', ['version', '--client', '-o', 'json']],
    ['helm', ['version', '--short']],
  ]) {
    const output = run(tool(name), args, { stdio: 'pipe' });
    if (!output.includes(`v${pins[name].version}`)) throw new Error(`Unexpected ${name} version`);
    console.log(output.trim());
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await install();
}

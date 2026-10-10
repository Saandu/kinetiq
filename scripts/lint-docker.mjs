import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../',import.meta.url));
const image = 'hadolint/hadolint:v2.15.1@sha256:32dac94127fd60b7b7e3fbfc65e1383b9b5e25c9bfd7b8536de7a539fe68a12d';
for(const area of ['postgres','node-service','web']) {
  console.log(`Linting infra/docker/${area}/Dockerfile with pinned hadolint`);
  const result = spawnSync('docker',['run','--rm','-i','--network=none','--read-only',
    '--cap-drop=ALL','--security-opt=no-new-privileges','--memory=128m','--cpus=1',
    '--entrypoint=hadolint',image,'-'],{
    cwd:root,input:await readFile(path.join(root,`infra/docker/${area}/Dockerfile`)),
    stdio:['pipe','inherit','inherit'],
  });
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`Dockerfile lint failed: ${area}`);
}

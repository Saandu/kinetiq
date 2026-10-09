import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAllDocuments } from 'yaml';
import { toolDirectory, run } from './setup-k8s-tools.mjs';

const objects = parseAllDocuments(await readFile(path.join(toolDirectory, 'helm/local.yaml'), 'utf8')).map((document) => document.toJS());
const config = objects.find((object) => object?.kind === 'ConfigMap' && object.metadata.name === 'kinetiq-web-server');
const deployment = objects.find((object) => object?.kind === 'Deployment' && object.metadata.name === 'kinetiq-web');
if (!config || !deployment) throw new Error('Run helm:verify first');
const directory = path.join(toolDirectory, 'helm/web-smoke');
await mkdir(directory, {recursive: true});
for (const [name, content] of Object.entries(config.data)) await writeFile(path.join(directory, name), content);
const container = deployment.spec.template.spec.containers[0];
const prepare = container.args[0].split('exec nginx')[0];
run('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges:true', '--user', '101:101', '--memory', '128m',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m,uid=101,gid=101',
  '--mount', `type=bind,source=${directory},target=/config,readonly`,
  '--entrypoint', '/bin/sh', container.image, '-ec',
  `${prepare}nginx -t -c /config/nginx.conf`]);
console.log('Rendered Nginx configuration passed in the real read-only, non-root web image.');

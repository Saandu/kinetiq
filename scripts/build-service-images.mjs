import { spawnSync } from 'node:child_process'

function docker(args) {
  const result = spawnSync('docker', args, { stdio: 'inherit', shell: false })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
for (const service of ['simulator', 'local-bridge', 'ingest', 'api']) {
  docker(['build', '--build-arg', `SERVICE=${service}`, '-t', `kinetiq-${service}:local`, '-f', 'infra/docker/node-service/Dockerfile', '.'])
  docker(['run', '--rm', '--entrypoint', 'node', `kinetiq-${service}:local`, '--input-type=module', '-e',
    `if(process.getuid() !== 1000) throw new Error('Expected non-root node user'); await import('@kinetiq/${service}'); console.log('${service}: production imports and non-root identity verified')`])
}

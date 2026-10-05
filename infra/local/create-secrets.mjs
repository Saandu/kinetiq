import { randomBytes } from 'node:crypto'
import { chmod, chown, mkdir, readFile, writeFile } from 'node:fs/promises'
import { simulationFleet } from '@kinetiq/contracts'

// One-off local setup. Never replace existing passwords on a database restart.
for (const area of ['admin', 'api', 'ingest', 'mqtt-device', 'mqtt-bridge', 'queue']) {
  const directory = `/secrets/${area}`
  await mkdir(directory, { recursive: true })
  await chown(directory, 1000, 1000)
  await chmod(directory, 0o700)
}
for (const file of ['admin/password', 'api/password', 'ingest/password', 'mqtt-device/password', 'mqtt-bridge/password']) {
  const path = `/secrets/${file}`
  try { await writeFile(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  if (!/^[a-f0-9]{64}$/.test(await readFile(path, 'utf8'))) throw new Error('Invalid local credential file')
  await chown(path, 1000, 1000)
}
const site = '11111111-1111-4111-8111-111111111112'
const acl = [`user bridge\ntopic read kinetiq/+/+/telemetry`, ...simulationFleet(12).map(({ id }) => `user ${id}\ntopic write kinetiq/${site}/${id}/telemetry`)].join('\n\n')
await writeFile('/secrets/mqtt-bridge/acl', acl + '\n', { mode: 0o644 })
console.log('Local credential volumes initialized; existing passwords preserved')

import { readFile, writeFile } from 'node:fs/promises'
import { telemetryBatchJsonSchema } from '../dist/index.js'

const path = new URL('../schema/telemetry-batch.v1.schema.json', import.meta.url)
const generated = JSON.stringify(telemetryBatchJsonSchema, null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (await readFile(path, 'utf8') !== generated) {
    throw new Error('Telemetry JSON Schema is stale. Run npm run schema:generate --workspace @kinetiq/contracts.')
  }
} else {
  await writeFile(path, generated)
}

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { Pool } from 'pg'
import openapiTS, { astToString } from 'openapi-typescript'
import { buildApi } from '../dist/index.js'

// Schema generation does not execute routes or open a database connection.
const pool = new Pool({ connectionString: 'postgres://kinetiq_api:unused@127.0.0.1:1/unused', max: 1 })
const api = await buildApi({ pool, demoOrganizationId: '11111111-1111-4111-8111-111111111111' })
try {
  const document = api.swagger()
  const schema = new URL('../../../packages/contracts/schema/api.openapi.json', import.meta.url)
  const types = new URL('../../../packages/contracts/src/generated/api.ts', import.meta.url)
  const artifacts = [[schema, JSON.stringify(document, null, 2) + '\n'], [types, astToString(await openapiTS(document))]]
  if (process.argv.includes('--write')) {
    await mkdir(new URL('../../../packages/contracts/src/generated/', import.meta.url), { recursive: true })
    for (const [path, content] of artifacts) await writeFile(path, content)
  } else {
    for (const [path, content] of artifacts) {
      if ((await readFile(path, 'utf8')).replaceAll('\r\n', '\n') !== content) throw new Error('API schema drift: run npm run schema:update --workspace @kinetiq/api')
    }
  }
} finally { await api.close(); await pool.end() }

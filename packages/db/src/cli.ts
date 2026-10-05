import { Pool } from 'pg'
import { migrate } from './migrate.js'
import { seed } from './seed.js'

const operation = process.argv[2]
if (!['migrate', 'seed'].includes(operation ?? '')) throw new Error('Usage: cli.js migrate|seed')
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; use a migration identity')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  if (operation === 'migrate') await migrate(pool)
  else await seed(pool)
  console.log(`Database ${operation} completed`)
} finally { await pool.end() }

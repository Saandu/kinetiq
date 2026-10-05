import type { Pool } from 'pg'
import { DEMO_FLEET, simulationFleet } from '@kinetiq/contracts'

export const DEMO_ORGANIZATION = '11111111-1111-4111-8111-111111111111'
export const DEMO_SITE = '11111111-1111-4111-8111-111111111112'
export const DEMO_MACHINES = DEMO_FLEET

// Explicit development command, run by the migration identity, never service startup.
export async function seed(pool: Pool, count: number = DEMO_FLEET.length): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("INSERT INTO kinetiq.organizations (id, name) VALUES ($1, 'Kinetiq Demo') ON CONFLICT DO NOTHING", [DEMO_ORGANIZATION])
    await client.query("INSERT INTO kinetiq.sites (id, organization_id, name) VALUES ($1, $2, 'Demo floor') ON CONFLICT DO NOTHING", [DEMO_SITE, DEMO_ORGANIZATION])
    for (const { id, name, kind, location } of simulationFleet(count)) {
      await client.query(`INSERT INTO kinetiq.machines (id, organization_id, site_id, name, kind, location)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [id, DEMO_ORGANIZATION, DEMO_SITE, name, kind, location])
      await client.query('INSERT INTO kinetiq.devices (thing_name, organization_id, machine_id) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING', [id, DEMO_ORGANIZATION])
      await client.query(`INSERT INTO kinetiq.machine_settings (machine_id, organization_id, state_names)
        VALUES ($1, $2, ARRAY['', '', '', '', '', '', '', '']) ON CONFLICT DO NOTHING`, [id, DEMO_ORGANIZATION])
      await client.query('INSERT INTO kinetiq.model_settings (machine_id, organization_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, DEMO_ORGANIZATION])
      await client.query('INSERT INTO kinetiq.machine_modes (machine_id, organization_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, DEMO_ORGANIZATION])
    }
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release() }
}

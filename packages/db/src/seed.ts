import type { Pool } from 'pg'

export const DEMO_ORGANIZATION = '11111111-1111-4111-8111-111111111111'
export const DEMO_SITE = '11111111-1111-4111-8111-111111111112'
export const DEMO_MACHINES = [
  ['DEMO-CNC-01', 'Milling cell', 'milling', 'Zone A'],
  ['DEMO-DRL-02', 'Drill station', 'drilling', 'Zone A'],
  ['DEMO-LTH-03', 'Turning cell', 'lathe', 'Zone B'],
  ['DEMO-PRS-04', 'Forming press', 'press', 'Zone B'],
  ['DEMO-GRD-05', 'Grinding station', 'grinding', 'Zone C'],
  ['DEMO-WLD-06', 'Welding cell', 'welding', 'Zone C'],
  ['DEMO-CNV-07', 'Transfer conveyor', 'conveyor', 'Zone D'],
  ['DEMO-PMP-08', 'Cooling pump', 'pump', 'Zone D'],
] as const

// Explicit development command, run by the migration identity, never service startup.
export async function seed(pool: Pool): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("INSERT INTO kinetiq.organizations (id, name) VALUES ($1, 'Kinetiq Demo') ON CONFLICT DO NOTHING", [DEMO_ORGANIZATION])
    await client.query("INSERT INTO kinetiq.sites (id, organization_id, name) VALUES ($1, $2, 'Demo floor') ON CONFLICT DO NOTHING", [DEMO_SITE, DEMO_ORGANIZATION])
    for (const [id, name, kind, location] of DEMO_MACHINES) {
      await client.query(`INSERT INTO kinetiq.machines (id, organization_id, site_id, name, kind, location)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [id, DEMO_ORGANIZATION, DEMO_SITE, name, kind, `Demo floor · ${location}`])
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

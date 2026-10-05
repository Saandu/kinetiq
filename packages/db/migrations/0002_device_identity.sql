-- Only ingest can resolve an authenticated envelope before tenant context exists.
-- The function returns a device identity, not general tenant data.
CREATE ROLE kinetiq_registry NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA kinetiq TO kinetiq_registry;
GRANT SELECT (organization_id, machine_id, thing_name) ON kinetiq.devices TO kinetiq_registry;
GRANT SELECT (id, organization_id, site_id) ON kinetiq.machines TO kinetiq_registry;
GRANT EXECUTE ON FUNCTION kinetiq.current_organization() TO kinetiq_registry;
CREATE POLICY registry_devices ON kinetiq.devices FOR SELECT TO kinetiq_registry USING (true);
CREATE POLICY registry_machines ON kinetiq.machines FOR SELECT TO kinetiq_registry USING (true);
CREATE FUNCTION kinetiq.resolve_device(p_thing text, p_machine text, p_site uuid)
RETURNS TABLE (organization_id uuid, machine_id text, thing_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT d.organization_id, d.machine_id, d.thing_name
  FROM kinetiq.devices d JOIN kinetiq.machines m
    ON m.id = d.machine_id AND m.organization_id = d.organization_id
  WHERE d.thing_name = p_thing AND d.machine_id = p_machine AND m.site_id = p_site
$$;
-- The function owner can read mapping columns only, with explicit RLS policies.
-- No runtime role is a member of this NOLOGIN role; no superuser is needed here.
GRANT CREATE ON SCHEMA kinetiq TO kinetiq_registry;
ALTER FUNCTION kinetiq.resolve_device(text, text, uuid) OWNER TO kinetiq_registry;
REVOKE CREATE ON SCHEMA kinetiq FROM kinetiq_registry;
REVOKE ALL ON FUNCTION kinetiq.resolve_device(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kinetiq.resolve_device(text, text, uuid) TO kinetiq_ingest;

-- Hand-written PostgreSQL features supplement the Drizzle-generated base.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA kinetiq FROM PUBLIC;
CREATE SCHEMA partman;
CREATE EXTENSION pg_partman SCHEMA partman;
CREATE EXTENSION pg_cron;
REVOKE ALL ON SCHEMA partman, cron FROM PUBLIC;

DO $$
DECLARE service text;
BEGIN
  FOREACH service IN ARRAY ARRAY['kinetiq_api', 'kinetiq_ingest', 'kinetiq_analytics', 'kinetiq_alerts'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = service) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', service);
    END IF;
    EXECUTE format('ALTER ROLE %I SET statement_timeout = %L', service, '10s');
    EXECUTE format('ALTER ROLE %I SET lock_timeout = %L', service, '3s');
    EXECUTE format('ALTER ROLE %I SET idle_in_transaction_session_timeout = %L', service, '15s');
    EXECUTE format('GRANT USAGE ON SCHEMA kinetiq TO %I', service);
  END LOOP;
END $$;

CREATE FUNCTION kinetiq.current_organization() RETURNS uuid LANGUAGE sql STABLE
SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;
REVOKE ALL ON FUNCTION kinetiq.current_organization() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kinetiq.current_organization() TO kinetiq_api, kinetiq_ingest, kinetiq_analytics, kinetiq_alerts;

-- Foreign keys tie a row's tenant to its site, machine and actor.
ALTER TABLE kinetiq.machines ADD CONSTRAINT machines_site_tenant_fk
  FOREIGN KEY (site_id, organization_id) REFERENCES kinetiq.sites(id, organization_id);
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['devices', 'machine_settings', 'model_settings', 'machine_modes',
    'telemetry', 'telemetry_hourly', 'machine_health', 'predictions', 'alerts', 'maintenance_entries', 'fault_events'] LOOP
    EXECUTE format('ALTER TABLE kinetiq.%I ADD CONSTRAINT %I FOREIGN KEY (machine_id, organization_id) REFERENCES kinetiq.machines(id, organization_id)', relation, relation || '_machine_tenant_fk');
  END LOOP;
  FOREACH relation IN ARRAY ARRAY['audit_log', 'idempotency_keys', 'alert_dismissals'] LOOP
    EXECUTE format('ALTER TABLE kinetiq.%I ADD CONSTRAINT %I FOREIGN KEY (user_id, organization_id) REFERENCES kinetiq.app_users(id, organization_id)', relation, relation || '_user_tenant_fk');
  END LOOP;
  FOREACH relation IN ARRAY ARRAY['machine_settings', 'model_settings'] LOOP
    EXECUTE format('ALTER TABLE kinetiq.%I ADD CONSTRAINT %I FOREIGN KEY (updated_by, organization_id) REFERENCES kinetiq.app_users(id, organization_id)', relation, relation || '_actor_tenant_fk');
  END LOOP;
END $$;
ALTER TABLE kinetiq.maintenance_entries ADD CONSTRAINT maintenance_actor_tenant_fk
  FOREIGN KEY (created_by, organization_id) REFERENCES kinetiq.app_users(id, organization_id);
ALTER TABLE kinetiq.alert_dismissals ADD CONSTRAINT dismissal_alert_tenant_fk
  FOREIGN KEY (alert_id, organization_id) REFERENCES kinetiq.alerts(id, organization_id);

ALTER TABLE kinetiq.app_users ADD CONSTRAINT valid_user_role CHECK (role IN ('operator', 'engineer', 'admin'));
ALTER TABLE kinetiq.machines ADD CONSTRAINT valid_machine_id CHECK (id ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$' AND length(id) <= 64);
ALTER TABLE kinetiq.machines ADD CONSTRAINT valid_machine_kind CHECK (kind IN ('milling', 'drilling', 'lathe', 'press', 'grinding', 'welding', 'conveyor', 'pump'));
ALTER TABLE kinetiq.machine_settings ADD CONSTRAINT settings_state_count CHECK (cardinality(state_names) = 8 AND array_position(state_names, NULL) IS NULL);
ALTER TABLE kinetiq.machine_settings ADD CONSTRAINT settings_threshold_order CHECK (critical_below >= 0 AND critical_below < warning_below AND warning_below < watch_below AND watch_below <= 100);
ALTER TABLE kinetiq.model_settings ADD CONSTRAINT model_valid CHECK (method IN ('zscore', 'isolation_forest') AND window_minutes BETWEEN 1 AND 1440 AND zscore_threshold > 0 AND zscore_threshold < 'Infinity'::real AND contamination > 0 AND contamination <= 0.5 AND min_confidence BETWEEN 0 AND 1);
ALTER TABLE kinetiq.machine_modes ADD CONSTRAINT mode_versions CHECK (desired_version >= 0 AND reported_version >= 0 AND reported_version <= desired_version);
ALTER TABLE kinetiq.telemetry ADD CONSTRAINT telemetry_values CHECK (
  state_index BETWEEN 0 AND 7 AND isfinite(ts) AND temperature_c > '-Infinity'::real AND temperature_c < 'Infinity'::real
  AND vibration_mm_s >= 0 AND vibration_mm_s < 'Infinity'::real
  AND spindle_rpm >= 0 AND spindle_rpm < 'Infinity'::real AND power_kw >= 0 AND power_kw < 'Infinity'::real);
ALTER TABLE kinetiq.machine_health ADD CONSTRAINT health_values CHECK (method IN ('zscore', 'isolation_forest') AND anomaly_score BETWEEN 0 AND 100 AND health_score BETWEEN 0 AND 100 AND confidence BETWEEN 0 AND 1);
ALTER TABLE kinetiq.predictions ADD CONSTRAINT prediction_values CHECK (metric IN ('temperatureC', 'vibrationMmS', 'spindleRpm', 'powerKw') AND r2 BETWEEN 0 AND 1 AND slope > '-Infinity'::real AND slope < 'Infinity'::real AND threshold > '-Infinity'::real AND threshold < 'Infinity'::real);
ALTER TABLE kinetiq.alerts ADD CONSTRAINT alert_values CHECK (level BETWEEN 0 AND 3 AND kind IN ('availability', 'anomaly', 'offline', 'forecast') AND (resolved_at IS NULL OR resolved_at >= opened_at));
ALTER TABLE kinetiq.fault_events ADD CONSTRAINT fault_values CHECK (category IN ('inspection', 'adjustment', 'mechanical', 'electrical', 'lubrication') AND source IN ('simulator_injected', 'operator') AND (ended_at IS NULL OR ended_at >= started_at));
ALTER TABLE kinetiq.maintenance_entries ADD CONSTRAINT maintenance_category CHECK (category IN ('inspection', 'adjustment', 'mechanical', 'electrical', 'lubrication'));
ALTER TABLE kinetiq.telemetry_hourly ADD CONSTRAINT hourly_values CHECK (samples > 0 AND online_share BETWEEN 0 AND 1 AND cardinality(state_share) = 8 AND array_position(state_share, NULL) IS NULL AND 0 <= ALL(state_share) AND 1 >= ALL(state_share));

-- Dedupe only open alerts; a resolved condition may open a new alert later.
CREATE UNIQUE INDEX alerts_open_dedupe ON kinetiq.alerts (organization_id, dedupe_key) WHERE resolved_at IS NULL;
CREATE INDEX telemetry_tenant_time ON kinetiq.telemetry (organization_id, ts DESC);
CREATE INDEX health_tenant_time ON kinetiq.machine_health (organization_id, ts DESC);
CREATE INDEX predictions_machine_time ON kinetiq.predictions (organization_id, machine_id, computed_at DESC);
CREATE INDEX alerts_machine_open ON kinetiq.alerts (organization_id, machine_id, opened_at DESC);
CREATE INDEX idempotency_expiry ON kinetiq.idempotency_keys (created_at);
CREATE INDEX audit_tenant_time ON kinetiq.audit_log (organization_id, at DESC);
CREATE INDEX machines_site ON kinetiq.machines (site_id, organization_id);
DO $$
DECLARE relation text; tenant_column text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['organizations', 'sites', 'app_users', 'audit_log', 'idempotency_keys', 'machines',
    'devices', 'machine_settings', 'model_settings', 'machine_modes', 'telemetry', 'telemetry_hourly',
    'machine_health', 'predictions', 'alerts', 'alert_dismissals', 'maintenance_entries', 'fault_events'] LOOP
    tenant_column := CASE WHEN relation = 'organizations' THEN 'id' ELSE 'organization_id' END;
    EXECUTE format('ALTER TABLE kinetiq.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('ALTER TABLE kinetiq.%I FORCE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY tenant_isolation ON kinetiq.%I USING (%I = (SELECT kinetiq.current_organization())) WITH CHECK (%I = (SELECT kinetiq.current_organization()))', relation, tenant_column, tenant_column);
    IF relation <> 'organizations' THEN
      EXECUTE format('CREATE INDEX %I ON kinetiq.%I (organization_id)', relation || '_tenant_idx', relation);
    END IF;
  END LOOP;
END $$;

-- Runtime identities cannot create tables, extensions or bypass tenant checks.
GRANT SELECT ON ALL TABLES IN SCHEMA kinetiq TO kinetiq_api;
GRANT INSERT, UPDATE ON kinetiq.machines, kinetiq.machine_settings, kinetiq.model_settings TO kinetiq_api;
GRANT INSERT ON kinetiq.audit_log, kinetiq.maintenance_entries TO kinetiq_api;
GRANT INSERT, DELETE ON kinetiq.idempotency_keys, kinetiq.alert_dismissals TO kinetiq_api;
GRANT UPDATE (maintenance_mode, monitoring_enabled, desired_version, updated_at) ON kinetiq.machine_modes TO kinetiq_api;
GRANT SELECT (thing_name, machine_id, organization_id, last_seen_at) ON kinetiq.devices TO kinetiq_ingest;
GRANT UPDATE (last_seen_at) ON kinetiq.devices TO kinetiq_ingest;
GRANT INSERT ON kinetiq.telemetry TO kinetiq_ingest;
-- PostgreSQL checks conflict-key visibility for ON CONFLICT DO NOTHING.
GRANT SELECT (machine_id, ts) ON kinetiq.telemetry TO kinetiq_ingest;
GRANT SELECT ON kinetiq.machines, kinetiq.telemetry, kinetiq.telemetry_hourly, kinetiq.machine_settings, kinetiq.model_settings, kinetiq.machine_modes, kinetiq.machine_health, kinetiq.predictions, kinetiq.fault_events TO kinetiq_analytics;
GRANT INSERT, UPDATE ON kinetiq.machine_health, kinetiq.predictions, kinetiq.fault_events TO kinetiq_analytics;
GRANT SELECT, INSERT, UPDATE ON kinetiq.alerts TO kinetiq_alerts;

-- Children remain private: services use the parent, whose RLS applies.
-- No default grant to future tables or partitions.
SELECT partman.create_parent(p_parent_table := 'kinetiq.telemetry', p_control := 'ts', p_interval := '1 day',
  p_premake := 7, p_start_partition := (date_trunc('day', now()) - interval '30 days')::text, p_default_table := false);
UPDATE partman.part_config SET retention = '30 days', retention_keep_table = false,
  infinite_time_partitions = true, inherit_privileges = false WHERE parent_table = 'kinetiq.telemetry';
SELECT partman.create_parent(p_parent_table := 'kinetiq.machine_health', p_control := 'ts', p_interval := '1 month',
  p_premake := 2, p_start_partition := date_trunc('month', now())::text, p_default_table := false);
UPDATE partman.part_config SET inherit_privileges = false WHERE parent_table = 'kinetiq.machine_health';
SELECT cron.schedule('partition-maintenance', '0 * * * *', $$SELECT partman.run_maintenance(p_analyze := false)$$);
SELECT cron.schedule('idempotency-retention', '15 * * * *', $$DELETE FROM kinetiq.idempotency_keys WHERE created_at < now() - interval '24 hours'$$);
SELECT cron.schedule('hourly-retention', '20 2 * * *', $$DELETE FROM kinetiq.telemetry_hourly WHERE hour < now() - interval '1 year'$$);

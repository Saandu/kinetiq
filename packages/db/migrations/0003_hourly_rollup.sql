-- Run only as the maintenance identity. Runtime services cannot invoke this job.
CREATE FUNCTION kinetiq.refresh_hourly(p_from timestamptz, p_to timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog SET timezone = 'UTC' AS $$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from OR p_to - p_from > interval '31 days' THEN
    RAISE EXCEPTION 'Invalid hourly refresh range';
  END IF;
  INSERT INTO kinetiq.telemetry_hourly (
    machine_id, organization_id, hour, temperature_avg, temperature_min, temperature_max,
    vibration_avg, vibration_min, vibration_max, spindle_avg, spindle_min, spindle_max,
    power_avg, power_min, power_max, samples, online_share, state_share)
  SELECT machine_id, organization_id, date_trunc('hour', ts),
    avg(temperature_c), min(temperature_c), max(temperature_c),
    avg(vibration_mm_s), min(vibration_mm_s), max(vibration_mm_s),
    avg(spindle_rpm), min(spindle_rpm), max(spindle_rpm),
    avg(power_kw), min(power_kw), max(power_kw), count(*)::int, avg(online::int),
    ARRAY[avg((state_index=0)::int), avg((state_index=1)::int), avg((state_index=2)::int),
      avg((state_index=3)::int), avg((state_index=4)::int), avg((state_index=5)::int),
      avg((state_index=6)::int), avg((state_index=7)::int)]::real[]
  FROM kinetiq.telemetry
  WHERE ts >= date_trunc('hour', p_from) AND ts < date_trunc('hour', p_to) + interval '1 hour' AND ts <= now()
  GROUP BY machine_id, organization_id, date_trunc('hour', ts)
  ON CONFLICT (machine_id, hour) DO UPDATE SET
    temperature_avg = excluded.temperature_avg, temperature_min = excluded.temperature_min, temperature_max = excluded.temperature_max,
    vibration_avg = excluded.vibration_avg, vibration_min = excluded.vibration_min, vibration_max = excluded.vibration_max,
    spindle_avg = excluded.spindle_avg, spindle_min = excluded.spindle_min, spindle_max = excluded.spindle_max,
    power_avg = excluded.power_avg, power_min = excluded.power_min, power_max = excluded.power_max,
    samples = excluded.samples, online_share = excluded.online_share, state_share = excluded.state_share;
END $$;
REVOKE ALL ON FUNCTION kinetiq.refresh_hourly(timestamptz, timestamptz) FROM PUBLIC;
-- Recent rows refresh often; the daily sweep picks up late deliveries in retained raw data.
SELECT cron.schedule('hourly-rollup', '*/5 * * * *', $$SELECT kinetiq.refresh_hourly(now() - interval '2 hours', now())$$);
SELECT cron.schedule('hourly-rollup-backfill', '5 2 * * *', $$SELECT kinetiq.refresh_hourly(now() - interval '30 days', now())$$);

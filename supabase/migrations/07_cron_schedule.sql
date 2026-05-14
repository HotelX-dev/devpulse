-- Phase 10 — Cron schedule for Edge Functions
--
-- BEFORE RUNNING:
--   1. Enable pg_cron and pg_net in Supabase Dashboard → Database → Extensions
--   2. Deploy both functions:
--        supabase functions deploy daily-standup-check
--        supabase functions deploy monthly-snapshot-compute
--   3. Replace the two placeholder values below with your actual values:
--        YOUR_PROJECT_URL  → e.g. https://abcdefgh.supabase.co
--        YOUR_SERVICE_KEY  → Settings → API → service_role (secret)

-- ── 1. 7PM daily — standup check + alerts ────────────────────────────────────
-- 11:00 UTC = 7:00 PM MYT (UTC+8)
SELECT cron.schedule(
  'devpulse-daily-standup-check',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url     := 'YOUR_PROJECT_URL/functions/v1/daily-standup-check',
    headers := '{"Authorization":"Bearer YOUR_SERVICE_KEY","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- ── 2. 1st of month — monthly snapshot + forecast ────────────────────────────
-- 00:05 UTC on the 1st of each month
SELECT cron.schedule(
  'devpulse-monthly-snapshot',
  '5 0 1 * *',
  $$
  SELECT net.http_post(
    url     := 'YOUR_PROJECT_URL/functions/v1/monthly-snapshot-compute',
    headers := '{"Authorization":"Bearer YOUR_SERVICE_KEY","Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- ── Verify ────────────────────────────────────────────────────────────────────
-- SELECT jobname, schedule FROM cron.job;

-- ── Manual trigger for testing ────────────────────────────────────────────────
-- SELECT net.http_post(
--   url     := 'YOUR_PROJECT_URL/functions/v1/daily-standup-check',
--   headers := '{"Authorization":"Bearer YOUR_SERVICE_KEY","Content-Type":"application/json"}'::jsonb,
--   body    := '{}'::jsonb
-- );

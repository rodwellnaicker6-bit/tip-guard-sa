-- TipGuard SA — schedule Edge cron jobs (run once in Supabase SQL Editor)
-- Operator steps: docs/CRON_OPERATOR_RUNBOOK.md · schedules: docs/CRON.md (02:00 SAST = 00:00 UTC)
-- Prerequisites:
--   1. Extensions pg_cron + pg_net enabled (migration 20260625200000 or Dashboard → Database → Extensions)
--   2. Vault secret `service_role_key` = your project service role key (Dashboard → Project Settings → API)
--
-- Project: fyjmujhlqpvfryelnfum

-- Store service role in Vault (replace YOUR_SERVICE_ROLE_KEY; run once):
-- select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key', 'TipGuard cron auth');

-- Unschedule prior names (idempotent re-run)
select cron.unschedule(jobid) from cron.job where jobname in ('tipguard-webhook-retries', 'tipguard-reconcile-daily');

select cron.schedule(
  'tipguard-webhook-retries',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/process-webhook-retries',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Daily 02:00 SAST = 00:00 UTC (SAST is UTC+2, no DST since 2020)
select cron.schedule(
  'tipguard-reconcile-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/reconcile-daily',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Verify: select jobid, jobname, schedule, active from cron.job where jobname like 'tipguard-%';

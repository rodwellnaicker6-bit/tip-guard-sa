# Scheduled jobs (Supabase Cron / pg_cron)

Enable **pg_cron** in the Supabase Dashboard (Database → Extensions) if you run jobs in Postgres. Alternatively use **Dashboard → Integrations → Cron** to invoke Edge Functions with the service role key.

## Daily reconciliation

**Edge:** `reconcile-daily` (preferred) or legacy `paystack-reconcile` (24h rolling window).

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/reconcile-daily" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from_date":"2026-05-20","to_date":"2026-05-20"}'
```

**Suggested schedule:** daily 02:00 SAST (`0 0 2 * * *` UTC+2 ≈ `0 0 0 * * *` UTC — adjust for your TZ).

## Webhook retry drain

**Edge:** `process-webhook-retries`

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/process-webhook-retries" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Suggested schedule:** every 15 minutes.

## pg_cron SQL stub (optional)

After enabling `pg_cron`, store secrets in Vault and call Edge via `net.http_post` (requires `pg_net`). Example stub only — replace URL and secret:

```sql
-- select cron.schedule(
--   'tipguard-reconcile-daily',
--   '0 2 * * *',
--   $$ select net.http_post(
--     url := 'https://<ref>.supabase.co/functions/v1/reconcile-daily',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   ); $$
-- );
```

## Payout report (SQL, no cron)

```sql
select public.payout_reconciliation_report(current_date);
```

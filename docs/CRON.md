# Scheduled jobs (Supabase Cron / pg_cron)

**Project ref:** `fyjmujhlqpvfryelnfum`  
**Base URL:** `https://fyjmujhlqpvfryelnfum.supabase.co`

Enable **pg_cron** and **pg_net** in the Supabase Dashboard (Database → Extensions) if you run jobs in Postgres. For Edge invocations, use either:

1. **Dashboard → Integrations → Cron** — [Cron overview](https://supabase.com/dashboard/project/fyjmujhlqpvfryelnfum/integrations/cron/overview) (create HTTP POST jobs below), or  
2. **SQL** — run `scripts/schedule-cron-jobs.sql` after storing `service_role_key` in Vault (see file header).

Migration `20260625200000_launch_cron_admin_payout.sql` enables extensions on push; scheduling still requires Vault secret + SQL or Dashboard UI.

## Supabase Dashboard — Cron job URLs

Create **HTTP POST** jobs with header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` and `Content-Type: application/json`. Never put the service role key in client code or Vercel env exposed to the browser.

| Job name | Schedule (suggested) | URL |
|----------|----------------------|-----|
| TipGuard webhook retries | Every **15 minutes** (`*/15 * * * *`) | `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/process-webhook-retries` |
| TipGuard daily reconcile | Daily **02:00 SAST** (`0 0 2 * * *` in SAST; use UTC offset in dashboard) | `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/reconcile-daily` |

### Webhook retry drain

**Edge:** `process-webhook-retries`

```bash
curl -X POST "https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/process-webhook-retries" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Suggested schedule:** every 15 minutes.

### Daily reconciliation

**Edge:** `reconcile-daily` (preferred) or legacy `paystack-reconcile` (24h rolling window).

```bash
curl -X POST "https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/reconcile-daily" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from_date":"2026-05-20","to_date":"2026-05-20"}'
```

**Suggested schedule:** daily 02:00 SAST (adjust cron expression when DST changes).

### Health probe (optional, external)

Uptime tools may **GET** (no auth):

`https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/health`

See [MONITORING.md](./MONITORING.md).

## pg_cron SQL (executable)

After `supabase db push`, store the service role key in Vault, then run **`scripts/schedule-cron-jobs.sql`** in the SQL Editor. Or use the commented stubs below (same schedules).

After enabling `pg_cron`, store secrets in Vault and call Edge via `net.http_post` (requires `pg_net`). Example stub only — replace secret name if different:

```sql
-- select cron.schedule(
--   'tipguard-webhook-retries',
--   '*/15 * * * *',
--   $$ select net.http_post(
--     url := 'https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/process-webhook-retries',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   ); $$
-- );

-- select cron.schedule(
--   'tipguard-reconcile-daily',
--   '0 2 * * *',
--   $$ select net.http_post(
--     url := 'https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/reconcile-daily',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
--       'Content-Type', 'application/json'
--     ),
--     body := '{"from_date": null, "to_date": null}'::jsonb
--   ); $$
-- );
```

## Cron reliability (production)

- **Idempotency:** `reconcile-daily` and `process-webhook-retries` are safe to re-run; reconciliation rows append to `reconciliation_log`, webhook retries use row-level status (`pending` → `processing` → `completed` / `dead_letter`).
- **Auth:** Schedule with the **service role** key in the `Authorization: Bearer` header only (never expose in the client). Rotate keys if a cron secret leaks.
- **Monitoring:** After scheduling, confirm at least one successful run in Edge Function logs within 24h. Alert on `webhook_retry_queue` depth (`status = pending` for >1h) and `reconciliation_log.mismatch_count > 0`.
- **Failure handling:** If `process-webhook-retries` fails repeatedly, inspect `webhook_retry_queue.error_message` in Admin → Fraud; replay stuck Paystack events manually after fixing root cause.
- **Timezone:** Reconcile for **SAST** business dates; adjust cron UTC offset when DST changes.

## Payout report (SQL, no cron)

```sql
select public.payout_reconciliation_report(current_date);
```

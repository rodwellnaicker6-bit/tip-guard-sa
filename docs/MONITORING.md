# Monitoring & alerts (TipGuard SA)

## Health endpoint

Ping (no auth required for GET):

```text
https://<project-ref>.supabase.co/functions/v1/health
```

Expected JSON: `{ "ok": true, "supabase": "ok", "version": "…", "maintenance": false, "ts": "…" }`.

- **200** — DB reachable via service role probe on `platform_settings`.
- **503** — `supabase: "degraded"` or unconfigured.

Optional: set Supabase secret `APP_VERSION` to your git tag or release name.

Configure **Better Uptime**, **UptimeRobot**, or Vercel **Monitoring** to GET this URL every 1–5 minutes.

## Sentry (frontend)

When `VITE_SENTRY_DSN` is set in Vercel Production:

- `src/lib/sentry.ts` initializes `@sentry/react` (disabled in dev).
- `ErrorBoundary` and unhandled errors are captured when DSN is present.
- No boot crash if DSN is missing or package load fails.

**Alerts:** Sentry → **Alerts** → spike in `unhandled` or payment route errors; route to email/Slack.

## Vercel

- **Deployments** — failed builds notify via Vercel integrations.
- **Observability** (if enabled) — latency and 5xx on serverless routes.
- No `/api/health` rewrite is required; use the Supabase `health` function URL above.

## Paystack

- Dashboard → **Settings** → **Webhooks** — alert on repeated non-200 deliveries.
- Review `webhook_retry_queue` for rows stuck in `pending` (see [WEBHOOK_RETRY_QUEUE.md](./WEBHOOK_RETRY_QUEUE.md)).

## Supabase platform

- Subscribe to [status.supabase.com](https://status.supabase.com).
- Dashboard → **Reports** — database CPU, connections, Edge invocations.

## Vercel alerts (production beta)

- **Deployments** — enable failed-build notifications (email/Slack integration).
- **Observability** (Pro) — alert on 5xx rate or p95 latency spike on production deployment.
- **Environment** — alert if Production env vars change (`VITE_PAYSTACK_PUBLIC_KEY`, `VITE_SUPABASE_URL`); accidental `pk_test` on prod breaks live tips.

## Sentry alert rules

When `VITE_SENTRY_DSN` is set:

| Alert | Condition | Route |
|-------|-----------|-------|
| Payment errors | Issue count &gt; 10 in 1h, filter `paystack` or `TipCheckout` | Email + Slack |
| Unhandled spike | `unhandled` events &gt; 5 in 15m | On-call |
| New issue (P0) | First seen on `paystack-webhook` client tag | Immediate review |

## Supabase health ping

- **URL:** `GET https://<project-ref>.supabase.co/functions/v1/health` every 1–5 min (Better Uptime / UptimeRobot).
- **Alert:** non-200 or `ok: false` / `supabase: "degraded"` for 2 consecutive checks.
- **Beta:** same URL linked from `/admin/metrics`.

## Webhook failure thresholds

| Metric | Beta threshold | Action |
|--------|----------------|--------|
| `webhook_retry_queue.status = failed` | &gt; 0 for 1h | `/admin/fraud`; Edge logs `paystack-webhook` |
| `pending` rows | &gt; **10** | Run `process-webhook-retries` ([CRON.md](./CRON.md)) |
| `dead_letter` | any growth day-over-day | Manual replay or mark resolved; [WEBHOOK_RETRY_QUEUE.md](./WEBHOOK_RETRY_QUEUE.md) |
| Paystack dashboard | 3+ consecutive non-200 | Verify HMAC secret + function deploy |

## Reconcile mismatch alerts

- **`admin_ops_metrics.reconciliation_mismatches_7d`** (via `/admin/metrics`) — alert if &gt; **0** after daily `reconcile-daily` cron.
- SQL spot-check:

```sql
select run_at, mismatch_count, notes
from public.reconciliation_log
order by run_at desc
limit 7;
```

## Failure alerts (launch)

| Signal | Threshold | Action |
|--------|-----------|--------|
| `health` Edge | Non-200 or `supabase: "degraded"` | Page on-call; check DB connections |
| Paystack webhook dashboard | Repeated 4xx/5xx to `paystack-webhook` | Inspect Edge logs; check `claim_*` RPCs exist |
| `webhook_retry_queue` | `pending` &gt; 10 or `dead_letter` growing | `/admin/fraud`; run `process-webhook-retries` |
| Sentry | Spike on `TipCheckout` / `paystack` | [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) |
| Reconcile mismatches | `reconciliation_mismatches_7d` &gt; 0 | [RECONCILIATION.md](./RECONCILIATION.md); hold merchant cap increase |
| `npm run verify:paystack` | Exit non-zero | HMAC secret mismatch or Edge not deployed |

## RPC latency (pre-launch baseline)

Run after migrations:

```bash
npx tsx scripts/stress-qr-resolve.ts <token> 50
```

**21 May 2026** (`demo-staging-qr-01`, remote, post-70000): p50 **254ms**, p95 **363ms**, 0/50 errors (`npm run stress:qr`). Alert if p95 &gt; 800ms sustained or error rate &gt; 10%.

Edge functions: log `webhook_claim` / `payment_events_init` errors in Supabase Dashboard → Edge → Logs.

## `payment_events` audit trail (SQL)

```sql
-- Recent provider events (service_role or admin SQL editor)
select id, provider, provider_event_id, event_type, status, paystack_reference, created_at
from public.payment_events
order by created_at desc
limit 50;

-- Init + verify + webhook for one reference
select provider_event_id, event_type, status, created_at
from public.payment_events
where paystack_reference = '<reference>'
   or provider_event_id like '%<reference>%'
order by created_at;

-- Duplicate webhook dedupe (should be one claim row per event id)
select provider, provider_event_id, count(*)
from public.payment_events
where provider = 'paystack'
group by 1, 2
having count(*) > 1;
```

## Cron stubs (post-MVP wiring)

| Function | Suggested schedule | Auth |
|----------|-------------------|------|
| `process-webhook-retries` | Every 15 min | `Bearer <SERVICE_ROLE_KEY>` POST |
| `reconcile-daily` | Daily 02:00 SAST | Same |

## Runbook links

- [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md) — controlled beta phases, daily playbook, rollback triggers
- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)
- [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)
- [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md)

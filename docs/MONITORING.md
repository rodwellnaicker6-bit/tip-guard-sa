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

## Failure alerts (launch)

| Signal | Threshold | Action |
|--------|-----------|--------|
| `health` Edge | Non-200 or `supabase: "degraded"` | Page on-call; check DB connections |
| Paystack webhook dashboard | Repeated 4xx/5xx to `paystack-webhook` | Inspect Edge logs; check `claim_*` RPCs exist |
| `webhook_retry_queue` | `pending` &gt; 10 or `dead_letter` growing | `/admin/fraud`; run `process-webhook-retries` |
| Sentry | Spike on `TipCheckout` / `paystack` | [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) |
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

- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)
- [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)
- [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md)

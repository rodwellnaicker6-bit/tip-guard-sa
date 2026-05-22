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

## Cron stubs (post-MVP wiring)

| Function | Suggested schedule | Auth |
|----------|-------------------|------|
| `process-webhook-retries` | Every 15 min | `Bearer <SERVICE_ROLE_KEY>` POST |
| `paystack-reconcile` | Daily 02:00 SAST | Same |

## Runbook links

- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)
- [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)
- [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md)

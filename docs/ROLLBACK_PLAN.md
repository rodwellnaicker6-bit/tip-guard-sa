# Rollback plan (TipGuard SA)

Use this when a production deploy causes regressions, payment failures, or data-risk incidents.

## 1. Vercel — instant frontend rollback

1. Vercel → **Deployments** → find the last known-good **Production** deployment.
2. **⋯** → **Promote to Production** (instant; no rebuild).
3. Hard-refresh the live URL and smoke: `/`, `/login`, one tip flow in test mode if applicable.

Rollback only reverts the **built SPA**. It does not revert database migrations or Edge Function code.

## 2. Supabase Edge Functions

1. Identify the last good git commit for `supabase/functions/`.
2. Redeploy affected functions from that commit:

```bash
supabase functions deploy paystack-webhook
supabase functions deploy paystack-initialize
# … other functions as needed
```

3. Confirm Paystack webhook deliveries return **200** in Paystack Dashboard → Webhooks.

## 3. Database migrations — caution

- Migrations are **additive**. Rolling back SQL often means a **forward-fix** migration, not deleting applied files.
- Before any schema rollback: take a manual backup (see [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md)).
- If a migration partially failed, inspect Supabase → **Database** → **Migrations** and fix forward; do not re-run destructive DDL on live data without a restore plan.

## 4. Environment revert

| Layer | Action |
|-------|--------|
| **Vercel** | Restore previous `VITE_*` values; redeploy if keys changed |
| **Supabase secrets** | Dashboard → Edge Functions → Secrets — revert `PAYSTACK_SECRET_KEY`, `MAINTENANCE_MODE`, etc. |
| **Maintenance** | Set `VITE_MAINTENANCE_MODE=false` (Vercel) and `MAINTENANCE_MODE=false` (Supabase) after rollback |

## 5. Emergency maintenance (while investigating)

- Frontend: `VITE_MAINTENANCE_MODE=true` on Vercel Production → redeploy.
- API: `MAINTENANCE_MODE=true` in Supabase Edge secrets (503 on payment routes).
- Payouts only: set `platform_settings.payouts_frozen = true` via admin dashboard (no full maintenance page).

## 6. Post-rollback verification

- [ ] `GET https://<project-ref>.supabase.co/functions/v1/health` returns `supabase: "ok"`
- [ ] One test tip or verify flow in Paystack test/live as appropriate
- [ ] Admin dashboard loads; no spike in Sentry (if `VITE_SENTRY_DSN` set)
- [ ] Document incident in [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) template

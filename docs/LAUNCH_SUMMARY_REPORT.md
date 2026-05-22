# TipGuard SA — Launch summary (one-pager)

**Date:** 2026-05-21 · **Branch:** `main` · **Supabase:** `fyjmujhlqpvfryelnfum`

## Ready for pilot

| Area | Status |
|------|--------|
| QR resolve + expiry + merchant verification | Migration `20260625160000_launch_qr_hardening.sql` |
| Paystack init/webhook/retry/reconcile | HMAC verify, failed handlers, retry queue, `reconciliation_log` |
| Guard/merchant payout schedule UI | `PayoutSchedulePanel` on GuardHome + MerchantDashboard |
| Security | RLS on financial tables; `RequireAdmin`; webhook rate limits; `admin_audit_log` |
| Reliability | `health` Edge fn; Sentry when `VITE_SENTRY_DSN` set; offline/loading on QR checkout |

## Operator actions before production

1. Apply `20260625160000_launch_qr_hardening.sql` (SQL Editor or `db query --linked -f …`).
2. Schedule crons: `process-webhook-retries` (15m), `reconcile-daily` (daily) — see [CRON.md](./CRON.md).
3. Set live Paystack keys + confirm webhook deliveries.
4. Run `npm run build && npm run lint && npm run verify:supabase && npm run verify:paystack`.

## Known blockers (not launch-stopper for pilot)

- Full `supabase db push` history repair on long-lived projects — use hotfix SQL per [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md).
- Payout settlement still operator-driven (no Paystack transfer API in `request-payout`).
- Reference-level Paystack CSV reconciliation is manual — see [RECONCILIATION.md](./RECONCILIATION.md).

## Multi-location

`merchant_locations` is wired in schema and guard/QR `location_id`; manage sites at `/merchant/locations`. No extra app work required for pilot.

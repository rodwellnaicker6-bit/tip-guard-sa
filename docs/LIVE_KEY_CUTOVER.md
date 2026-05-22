# Live key cutover checklist (`pk_test` → `pk_live`)

Complete [COMPLIANCE_SIGNOFF.md](./COMPLIANCE_SIGNOFF.md) and Phase 0 exit before live keys ([BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)).

## Pre-flight

- [ ] Phase 0: 7 days stable payouts + webhooks + recon = 0 mismatch
- [ ] `npm run build && npm run lint && npm run verify:supabase && npm run verify:paystack` green on `main`
- [ ] Cron jobs scheduled ([CRON_OPERATOR_RUNBOOK.md](./CRON_OPERATOR_RUNBOOK.md))
- [ ] Secure vault copy of **current** test keys for rollback

## 1. Paystack (live)

- [ ] Live merchant activated on Paystack
- [ ] Webhook URL unchanged: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`
- [ ] Webhook secret matches Supabase `PAYSTACK_SECRET_KEY` (live)
- [ ] Copy `sk_live_…` and `pk_live_…`

## 2. Supabase secrets

Dashboard → **Project Settings** → **Edge Functions** → Secrets:

| Secret | Value |
|--------|--------|
| `PAYSTACK_SECRET_KEY` | `sk_live_…` |

- [ ] Redeploy Edge: `paystack-initialize`, `paystack-verify`, `paystack-webhook`, `request-payout`
- [ ] `npm run verify:paystack` against live project (exit 0)

## 3. Vercel Production env

| Variable | Value |
|----------|--------|
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_…` |
| `VITE_PAYSTACK_TEST_MODE` | unset or `false` |
| `VITE_SUPABASE_URL` | unchanged |
| `VITE_SUPABASE_ANON_KEY` | unchanged |

- [ ] Redeploy Production from `main`
- [ ] Confirm no test-mode banner on production home

## 4. Smoke tip (invited Durban merchant)

- [ ] One **R10** live tip on printed QR
- [ ] `transactions` + `tips` succeeded; `payment_events` trail ([AUDIT_LOGGING.md](./AUDIT_LOGGING.md))
- [ ] Paystack dashboard shows live charge
- [ ] Optional: payout request + admin **Paid** path on test guard

## 5. Monitoring (first 24h)

- [ ] [OPERATOR_DAILY_CHECKLIST.md](./OPERATOR_DAILY_CHECKLIST.md) twice on day 1
- [ ] Alerts per [MONITORING.md](./MONITORING.md) (DLQ &gt; 5, recon mismatch, health down)

## Rollback (if smoke fails)

1. Restore `sk_test_` / `pk_test_` in Supabase + Vercel.
2. Redeploy Edge + Vercel.
3. Enable `VITE_MAINTENANCE_MODE` if partial outage ([ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)).
4. Post-mortem in [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

## Related

- [PAYSTACK_SETUP.md](./PAYSTACK_SETUP.md)
- [DEPLOY.md](../DEPLOY.md)

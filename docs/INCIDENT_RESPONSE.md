# Incident response checklist

Use for production outages, payment failures, fraud spikes, or data integrity concerns.

## 0. Severity (pick one)

| Level | Examples | Target response |
|-------|----------|-----------------|
| **SEV1** | No tips settling, webhook 5xx, data leak suspected | Immediate; all-hands |
| **SEV2** | Partial failures, payout freeze needed, admin down | < 1 hour |
| **SEV3** | Degraded UX, non-payment bug | Next business day |

## 1. Triage (first 15 minutes)

- [ ] Confirm scope: frontend only vs Edge vs database vs Paystack
- [ ] Check `GET …/functions/v1/health`
- [ ] Check Paystack webhook delivery log (last 20 events)
- [ ] Check Supabase status page
- [ ] Check Sentry (if configured) for new issue spike
- [ ] Assign **incident lead** and **comms** owner

## 2. Contain

- [ ] Enable maintenance: `VITE_MAINTENANCE_MODE=true` + `MAINTENANCE_MODE=true` (see [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md))
- [ ] Or freeze payouts only: Admin → **Freeze payouts**
- [ ] Pause marketing / QR campaigns if fraud or double-settlement risk
- [ ] Preserve logs: export Paystack webhook payloads, `payment_events`, `webhook_retry_queue`

## 3. Diagnose

- [ ] Recent deploy? → Vercel promote rollback + Edge redeploy
- [ ] Recent migration? → inspect `reconciliation_log`, `payment_events` mismatches
- [ ] Secret rotation? → verify `PAYSTACK_SECRET_KEY` matches Paystack mode (test/live)
- [ ] RLS change? → `npm run verify:supabase`

## 4. Recover

- [ ] Apply fix or rollback per [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)
- [ ] Replay failed webhooks from `webhook_retry_queue` (manual or `process-webhook-retries` cron)
- [ ] Run `paystack-reconcile` POST with service role; review `reconciliation_log`
- [ ] Disable maintenance; smoke one end-to-end tip

## 5. Communicate

- [ ] Internal: Slack/status doc with ETA
- [ ] External (if needed): short banner on maintenance page; merchant email for SEV1

## 6. Post-incident (within 48h)

- [ ] Timeline (UTC), root cause, blast radius
- [ ] Action items with owners and due dates
- [ ] Update [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) if recurring
- [ ] Backup verification if data touched ([BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md))

## Contacts (fill in for your org)

| Role | Contact |
|------|---------|
| On-call engineer | _@_ |
| Paystack support | dashboard chat |
| Supabase support | plan-dependent ticket |

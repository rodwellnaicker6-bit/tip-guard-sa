# Incident response checklist

Use for production outages, payment failures, fraud spikes, or data integrity concerns during **controlled beta** ([BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)).

## 0. Severity (pick one)

| Level | Examples | Target response | Beta comms |
|-------|----------|-----------------|------------|
| **SEV1** | No tips settling, webhook 5xx, suspected data leak, duplicate settlement | Immediate; all-hands | Pause all QR campaigns; notify invited merchants |
| **SEV2** | Partial failures, DLQ &gt; 5, payout freeze needed, admin down | &lt; 1 hour | Hold new Durban invites |
| **SEV3** | Degraded UX, non-payment bug | Next business day | Log in [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) |

## 1. Triage (first 15 minutes)

- [ ] Confirm scope: frontend only vs Edge vs database vs Paystack
- [ ] Check `GET …/functions/v1/health` — 2 consecutive failures = SEV1 ([MONITORING.md](./MONITORING.md))
- [ ] Check Paystack webhook delivery log (last 20 events)
- [ ] Check Supabase status page
- [ ] `/admin/metrics` — tips today, DLQ, recon mismatches
- [ ] Check Sentry (if `VITE_SENTRY_DSN` set) for new issue spike
- [ ] Assign **incident lead** and **comms** owner

## 2. Contain

- [ ] Enable maintenance: `VITE_MAINTENANCE_MODE=true` + `MAINTENANCE_MODE=true` ([ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md))
- [ ] Or freeze payouts only: `/admin` → **Freeze payouts** ([ADMIN_PROCEDURES.md](./ADMIN_PROCEDURES.md))
- [ ] Pause new merchant invites (beta cap) if payment path broken
- [ ] Preserve logs: Paystack payloads, `payment_events`, `webhook_retry_queue`, `admin_audit_log` export

## 3. Diagnose

- [ ] Recent deploy? → Vercel Instant Rollback + Edge redeploy if needed
- [ ] Recent migration? → `reconciliation_log`, [AUDIT_LOGGING.md](./AUDIT_LOGGING.md) SQL
- [ ] Secret rotation? → `PAYSTACK_SECRET_KEY` test/live match ([LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md))
- [ ] RLS change? → `npm run verify:supabase`
- [ ] Cron missing? → [CRON_OPERATOR_RUNBOOK.md](./CRON_OPERATOR_RUNBOOK.md)

## 4. Recover

- [ ] Apply fix or rollback per [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)
- [ ] Replay webhooks: `process-webhook-retries` or manual from `/admin/fraud`
- [ ] Run `reconcile-daily`; confirm `mismatch_count = 0`
- [ ] Payout wallet drift: [OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md) — do not raw-update status
- [ ] Disable maintenance; smoke one E2E tip (R10 invited merchant)

## 5. Communicate

- [ ] Internal: status thread with ETA and severity
- [ ] External SEV1: maintenance page + email to pilot merchants (template in [PHASE0_MERCHANT_PACK_DURBAN.md](./PHASE0_MERCHANT_PACK_DURBAN.md))

## 6. Post-incident (within 48h)

- [ ] Timeline (UTC + SAST), root cause, blast radius (tips ZAR, merchants affected)
- [ ] Action items with owners
- [ ] Update [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) if recurring
- [ ] Backup check if data touched ([BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md))

## Beta rollback triggers (quick)

Execute soft rollback (`pk_test` + maintenance) if any:

- Health `degraded` &gt; 15 min
- Payment success &lt; 95% over 1 h with active QR traffic
- DLQ &gt; 5 without resolution same day
- Recon mismatch after daily job + manual review
- Confirmed duplicate settlement

Full list: [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md#rollback-triggers).

## Contacts (fill in for your org)

| Role | Contact |
|------|---------|
| On-call engineer | _@_ |
| Product / ops (Durban pilot) | _@_ |
| Paystack support | dashboard chat |
| Supabase support | plan-dependent ticket |

## Related runbooks

- [OPERATOR_DAILY_CHECKLIST.md](./OPERATOR_DAILY_CHECKLIST.md)
- [RELEASE_BRANCH_POLICY.md](./RELEASE_BRANCH_POLICY.md) — hotfix branch naming

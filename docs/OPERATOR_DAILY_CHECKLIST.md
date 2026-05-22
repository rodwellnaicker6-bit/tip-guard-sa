# Operator daily checklist (beta)

**Time:** ~10 minutes each morning (SAST). **Scope:** Durban-first invite-only beta ([BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)).

## 1. Health & platform

- [ ] Open `/admin/metrics` — record tips today, failed webhooks, DLQ count, QR scans (24h), recon mismatches (7d).
- [ ] GET health Edge (link on metrics page) — `ok: true`, `supabase: ok` ([MONITORING.md](./MONITORING.md)).
- [ ] [status.supabase.com](https://status.supabase.com) — no active incident.

## 2. Paystack & webhooks

- [ ] Paystack Dashboard → **Webhooks** — no sustained 4xx/5xx to `paystack-webhook`.
- [ ] `/admin/fraud` — DLQ (`dead_letter`) **≤ 5**; `pending` not growing &gt; 1h.
- [ ] If DLQ &gt; 5 → [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md); run or verify `process-webhook-retries` cron ([CRON_OPERATOR_RUNBOOK.md](./CRON_OPERATOR_RUNBOOK.md)).

## 3. Reconciliation

- [ ] `reconciliation_mismatches_7d` on metrics = **0**.
- [ ] If &gt; 0: run `reconcile-daily` (cron or Admin → Transactions → Run daily reconcile); review last 7 rows in `reconciliation_log`.

## 4. Tips volume

- [ ] Compare tips today vs prior day; if &gt; 50% drop with active merchants, check Paystack + `payment_events` ([MONITORING.md](./MONITORING.md) SQL).
- [ ] Spot-check one succeeded tip reference in SQL (audit trail in [AUDIT_LOGGING.md](./AUDIT_LOGGING.md)).

## 5. Payouts & disputes

- [ ] `/admin` → Payouts — no `pending` older than 48h without operator action.
- [ ] Payouts not frozen unless intentional ([OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md)).
- [ ] Open disputes — triage or assign ([ADMIN_PROCEDURES.md](./ADMIN_PROCEDURES.md)).

## 6. Merchants (cap)

- [ ] Verified merchants ≤ **10** (Phase 1 cap).
- [ ] No new invites if payout or webhook stability regressed in last 7 days.

## Weekly (Friday)

- [ ] [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) beta weekly check
- [ ] `npm run stress:qr` on a production token ([STRESS_TEST.md](./STRESS_TEST.md))

## Escalation

| Trigger | Doc |
|---------|-----|
| Health down 15+ min | [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) SEV1 |
| DLQ &gt; 5 | [MONITORING.md](./MONITORING.md) |
| Recon mismatch | [RECONCILIATION.md](./RECONCILIATION.md) |

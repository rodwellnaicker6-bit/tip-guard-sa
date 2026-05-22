# TipGuard SA — Production Risk Report

**Audit:** Fintech integrity (final)  
**Date:** 21 May 2026  
**Base commits:** `028f5d3595f86797e1fc08dd79b4a913c738a316`, `a43a4f1`  
**Post-fix commit:** _(see git log after push)_

## Severity summary

| Severity | Count | Launch impact |
|----------|------:|---------------|
| **P0** | 4 found, **4 fixed** | Blockers addressed in `20260625130000` + Edge patches |
| **P1** | 8 | Accept with monitoring and near-term backlog |
| **P2** | 6 | Documentation / ops hygiene |

---

## P0 findings (fixed)

### P0-1: Double credit to `wallet_accounts` on repeated finalize

- **Risk:** Webhook + `paystack-verify`, or duplicate webhook delivery, could add `available_cents` multiple times while `guards.balance_cents` incremented once.
- **Mitigation:** `finalize_tip` now credits wallet only from rows in the `updated` CTE (`pending→succeeded`).
- **Status:** Fixed

### P0-2: Payout success did not clear `pending_cents`

- **Risk:** After `transfer.success`, guard balance showed funds stuck in pending though bank transfer completed.
- **Mitigation:** `settle_guard_payout_hold`; webhook calls before marking `paid`.
- **Status:** Fixed

### P0-3: Payout failure did not release hold

- **Risk:** `transfer.failed` / max retries left `pending_cents` inflated; available balance understated.
- **Mitigation:** `release_guard_payout_hold` on terminal failure; integrated with `schedule_payout_retry`.
- **Status:** Fixed

### P0-4: Payout request insert failure leaked hold

- **Risk:** `hold_guard_payout` succeeded but `payout_requests` insert failed → orphaned pending hold.
- **Mitigation:** `reverse_guard_payout_hold` in `request-payout` error path.
- **Status:** Fixed

---

## P1 findings (open / accepted)

| ID | Finding | Mitigation |
|----|---------|------------|
| P1-1 | Admin manual payout status (`paid`/`rejected`) does not call settle/release RPCs | Runbook: use webhook or add admin RPC wrapper |
| P1-2 | Dual ledger (`guards.balance_cents` + `wallet_accounts`) | Daily reconciliation job; long-term deprecate legacy column |
| P1-3 | `post_tip_settlement_hooks` duplicates analytics/activity on re-verify | Add idempotency key or guard on `tip_id` |
| P1-4 | Payout state machine not enforced in SQL | Add transition trigger in next migration |
| P1-5 | Reconciliation is aggregate count diff, not reference-level | Extend `reconcile-daily` with Paystack export match |
| P1-6 | `request-payout` does not initiate Paystack transfer (manual ops) | Document SOP; automate transfer initiation later |
| P1-7 | Admin audit relies on client calling `log_admin_audit` | Server-side audit in Edge for sensitive mutations |
| P1-8 | `hold_guard_payout` allows guard user_id via auth check (not only service_role) | Accept for MVP; tighten to service_role-only if abuse seen |

---

## P2 findings

| ID | Finding |
|----|---------|
| P2-1 | No `dead_letter` payout status (webhook DLQ only) — naming mismatch in runbooks |
| P2-2 | `commission_cents_floor` in schema unused in finalize formula |
| P2-3 | Paystack amount in webhook fraud check uses kobo units vs cents naming — verify env-specific |
| P2-4 | Cron jobs require manual Dashboard/cron setup (`CRON.md`) |
| P2-5 | `notify-payment` not wired from settlement hooks |
| P2-6 | Full Paystack ledger export reconciliation deferred (`src/payments/reconciliation.ts`) |

---

## Pre-launch sign-off checklist

- [x] P0 wallet double-credit on finalize remediated
- [x] P0 payout hold settle/release on transfer outcomes
- [x] P0 payout hold rollback on failed insert
- [x] Webhook idempotency (`claim_provider_webhook_event`)
- [x] Unique `tips.paystack_reference` and `payment_events` keys
- [x] `reconciliation_log` + `admin_ops_metrics` mismatch signal
- [x] Admin audit for freeze, guards, payouts, disputes
- [ ] Apply migration `20260625130000` to production Supabase
- [ ] Redeploy Edge functions `paystack-webhook`, `request-payout`
- [ ] Smoke test: tip → verify + webhook → single wallet credit
- [ ] Smoke test: payout hold → transfer.success → pending clears
- [ ] Smoke test: transfer.failed → hold returns to available
- [ ] Configure cron: `reconcile-daily`, `paystack-reconcile`, `process-webhook-retries`
- [ ] Confirm `PAYSTACK_SECRET_KEY` and webhook URL in Paystack dashboard

---

## Sign-off recommendation

**Ready with caveats**

Production may launch after deploying migration `20260625130000` and updated Edge functions, completing smoke tests above, and accepting P1 items (admin payout RPC wiring, reference-level reconciliation, settlement hook dedupe) in the first post-launch sprint.

**Not ready** if migration/Edge deploy is skipped — P0 issues exist on current production schema without the fix migration.

# TipGuard SA — Fintech Integrity Audit (Technical)

**Branch:** `main`  
**Commits reviewed:** `028f5d3`, `a43a4f1` (+ prior fintech migrations)  
**Audit date:** 21 May 2026  
**Fix migration:** `20260625130000_fintech_integrity_fixes.sql`

## Executive summary

Code and SQL were reviewed across settlement, payouts, idempotency, ledger invariants, admin audit, and reconciliation. **Four P0 defects** were found and patched in migration `20260625130000` and Edge functions `paystack-webhook`, `request-payout`. Launch is **ready with caveats** (see `PRODUCTION_RISK_REPORT.md`).

---

## 1. Atomic monetary operations

| Path | Mechanism | Finding |
|------|-----------|---------|
| `finalize_tip_from_paystack_reference` | Single PL/pgSQL function (implicit transaction) | **P0 fixed:** wallet credit previously ran against all `succeeded` tips for reference, not only rows updated `pending→succeeded`. Guards balance was gated; `wallet_accounts` was not. |
| `hold_guard_payout` | `FOR UPDATE` on `wallet_accounts`, then paired updates to wallet + `guards.balance_cents` | OK within one RPC. |
| `credit_wallet` | Service-role RPC | OK; webhook-only. |
| Edge payout insert | Hold RPC then separate `insert` | **P0 fixed:** insert failure left hold in place; added `reverse_guard_payout_hold`. |

**Recommendation (P1):** Document invariant: `guards.balance_cents` ≈ `wallet_accounts.available_cents` (legacy mirror); reconcile periodically.

---

## 2. No double payout paths

| Path | Credits guard? | Notes |
|------|----------------|-------|
| `paystack-webhook` `charge.success` / `guard_tip` | Yes (via `finalize_tip`) | Authoritative. |
| `paystack-verify` | Same RPC if Paystack reports success | Idempotent after fix (only pending tips credit). |
| `transfer.success` | **No** — only `payout_requests.status` + `settle_guard_payout_hold` | Correct: tip credit happens at charge time, not transfer. |
| `schedule_payout_retry` | No bank re-credit in code | Status/backoff only; no duplicate tip credit. |
| `request-payout` | No — moves available→pending | OK. |

**P0 fixed:** Duplicate webhook/verify could inflate `wallet_accounts.available_cents` while guards balance stayed correct.

---

## 3. Idempotency

| Control | Status |
|---------|--------|
| `claim_provider_webhook_event` / `claim_paystack_webhook_event` | `ON CONFLICT DO NOTHING` + row_count |
| `payment_events (provider, provider_event_id)` unique | Yes |
| `payment_events.paystack_reference` partial unique | `20260625120000` |
| `tips.paystack_reference` partial unique | `20260211000000` |
| `paystack-verify` `payment_events` upsert | `onConflict: provider,provider_event_id`, `ignoreDuplicates` |
| `finalize_tip` status gate | `where status = 'pending'` |
| `apply_loyalty_for_successful_tip` | `unique_violation` on `loyalty_ledger.ref_tip_id` |

**P1:** `post_tip_settlement_hooks` re-runs analytics/activity inserts on duplicate verify/webhook (loyalty is idempotent).

---

## 4. Ledger consistency

**Documented invariants (target state):**

1. Tip gross: `tips.amount_cents`
2. Commission: `round(amount_cents * platform_settings.fee_bps / 10000)` unless pre-set
3. Net to guard: `amount_cents - commission_cents` → `wallet_accounts.available_cents` on finalize
4. Payout hold: `hold_guard_payout` decreases `available_cents`, increases `pending_cents` by same amount
5. Payout success: `settle_guard_payout_hold` decreases `pending_cents` only (funds exited)
6. Payout failure: `release_guard_payout_hold` moves `pending` → `available`

**P1:** `guards.balance_cents` updated in parallel with wallet rows — drift possible if one path fails mid-flight (mitigated by single-RPC hold/finalize).

---

## 5. Balance calculations

| Field | Semantics |
|-------|-----------|
| `available_cents` | Withdrawable / payout-requestable balance |
| `pending_cents` | Held for in-flight payout requests |

`guard_earnings_summary` reads wallet with fallback to `guards.balance_cents` for available.

**P0 fixed:** Failed/successful transfers did not adjust `pending_cents` (funds appeared “stuck” in pending forever).

---

## 6. Rollback on failed payouts

| Event | Before audit | After fix |
|-------|--------------|-----------|
| `transfer.failed` / `transfer.reversed` | Retry scheduling only | `schedule_payout_retry`; on max retries → `failed` + `release_guard_payout_hold` |
| `transfer.success` | Status `paid` only | `settle_guard_payout_hold` then `paid` |
| Payout insert failure | Hold leaked | `reverse_guard_payout_hold` |

**P1:** Admin UI can set payout `paid`/`rejected` without calling settle/release RPCs.

---

## 7. Admin audit trail

| Action | Wired? |
|--------|--------|
| Payout freeze toggle | `AdminDashboard` → `log_admin_audit` |
| Guard approve/reject/flag | Yes |
| Payout status change | Yes |
| Dispute resolve | `AdminFraud` |

**P1:** Audit is client-invoked; malicious admin could skip RPC. Table is append-only via revoked direct INSERT on `admin_audit_log` (only `log_admin_audit` SECURITY DEFINER).

---

## 8. Payout state machine

**DB constraint:** `pending`, `processing`, `paid`, `rejected`, `failed`, `retrying`

| Transition | Enforced in DB? |
|------------|-----------------|
| Valid transitions only | **No** — any status can be set via admin update or webhook |
| `dead_letter` | Not in schema (audit checklist used aspirational label; DLQ exists for **webhooks** only) |

**P1:** Add transition trigger or restrict admin updates to allowed edges.

---

## 9. Reconciliation mismatch alerts

| Job | Writes `reconciliation_log`? | Admin visibility |
|-----|------------------------------|------------------|
| `reconcile-daily` | Yes (`scope: reconcile_daily`) | `admin_ops_metrics.reconciliation_mismatches_7d` |
| `paystack-reconcile` | Yes (`scope: paystack_24h`) | Same |

**P1:** Mismatch is `abs(payment_events.processed - transactions.succeeded)` count delta, not per-reference matching (noted in `paystack-reconcile` details).

---

## 10. Files reviewed

- Migrations: `20260624140000`, `20260625120000`, `20260521140000`, `20260211000000`, `20260622100000`
- Edge: `paystack-webhook`, `paystack-verify`, `request-payout`, `reconcile-daily`, `paystack-reconcile`
- App: `AdminDashboard`, `AdminMetrics`, `adminAudit.ts`

---

## Critical fixes applied

1. **`finalize_tip_from_paystack_reference`** — wallet credit only from `updated` CTE (pending→succeeded).
2. **`settle_guard_payout_hold` / `release_guard_payout_hold` / `reverse_guard_payout_hold`** — payout wallet lifecycle.
3. **`schedule_payout_retry`** — release hold when max retries exceeded.
4. **`paystack-webhook`** — invoke settle/release on transfer events.
5. **`request-payout`** — reverse hold when payout row insert fails.

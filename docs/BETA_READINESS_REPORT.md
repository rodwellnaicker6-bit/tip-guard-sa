# TipGuard SA — Beta Readiness Report

**Validation date:** 2026-05-22  
**Baseline branch:** `main` @ `3e0cf36` (post-`f11d2a8` beta gates)  
**Target:** Controlled fintech beta — operational stability over growth velocity  
**Project:** `fyjmujhlqpvfryelnfum` (staging / pre-live keys)

---

## Executive summary

| Gate | Result |
|------|--------|
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run verify:supabase` | **PASS** |
| `npm run verify:paystack` | **PASS** (test keys) |
| `npm run test:e2e` | **PASS** (21 tests) |
| `npm run stress:qr` (100× `demo-staging-qr-01`) | **PASS** (0 errors, p95 343ms) |
| `npm run test:auth` | **PASS** (signUp; signIn-after-delete warning only) |

**GO / NO-GO (controlled beta):** **GO** — with **5 operational blockers** before `pk_live_` Phase 0 and merchant QR UI smoke on production URLs.

---

## Pass / fail by validation area

| # | Area | Automated | Manual / code | Result | Notes |
|---|------|-----------|---------------|--------|-------|
| 1 | Full merchant flow | `e2e/merchant-demo-flow.spec.ts` | `scripts/operator-e2e-checklist.sh` §3–4 | **PARTIAL PASS** | Login → `/merchant`, setup redirect, nav; **QR regenerate/revoke UI** not automated (Supabase auth rate limits under parallel e2e). RPC + UI exist in code. |
| 2 | QR generation + scan | `verify:supabase`, `stress:qr`, `e2e/tip-and-qr.spec.ts` | `regenerate_qr_code_token` in migration `20260625170000` | **PASS** | 100× resolve `demo-staging-qr-01`: 0 errors; `/qr/demo-staging-qr-01` → tip shell. |
| 3 | Payment success/failure | `verify:paystack`, `e2e` `/payment/failure` | `paystack-webhook` `charge.failed` handler | **PASS** (test mode) | `PaymentFailure` at `/payment/failure`; webhook updates `tips` + `transactions` to `failed`. Live card E2E still operator-only. |
| 4 | Webhook replay / idempotency | grep + `verify:paystack` HMAC | See § Webhook replay steps | **PASS** (code) | `claim_provider_webhook_event` → duplicate `200` `{ duplicate: true }`. Cron replay **not scheduled** (blocker). |
| 5 | Payout verification | grep `admin_update_payout_status`, `request-payout` | `operator-e2e-checklist.sh` §4 | **PARTIAL PASS** | RPC + Edge deployed; **no Paystack transfer API** in `request-payout`; admin settle/release P1 gap. |
| 6 | Auth / session timeout | `useSessionIdle.ts`, `.env.example` | `SessionIdleWatcher` **disabled** in `App.tsx` | **PARTIAL PASS** | Scaffold + `VITE_SESSION_IDLE_MINUTES` documented; not active in production build. |
| 7 | Stress concurrent QR | `npm run stress:qr -- demo-staging-qr-01 100` | [STRESS_TEST.md](./STRESS_TEST.md) | **PASS** | p50 283ms, p95 343ms, max 660ms. |
| 8 | Audit / event logging | docs grep | [MONITORING.md](./MONITORING.md), [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md) | **PASS** | SQL for `payment_events`, `admin_audit_log`, `fraud_events` documented. |
| 9 | Rollback / recovery | file existence | [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md), [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) | **PASS** | Coherent Vercel + Edge + forward-fix DB; weekly backup checklist. |

---

## Launch risk assessment

| Category | Risk | Rationale |
|----------|------|-----------|
| Payments (test keys) | **Low** | `verify:paystack` green; webhook HMAC + idempotency wired. |
| Payments (live keys) | **Medium** | No validated `pk_live_`/`sk_live_` cutover in this pass; compliance sign-off required. |
| QR / tip resolve | **Low** | RPC parity + 100-iteration stress within beta p95 target (&lt;500ms). |
| Webhooks / DLQ | **Medium** | Idempotency solid; `process-webhook-retries` cron not scheduled. |
| Payouts | **Medium** | Operator-driven status changes; transfer API and hold settle/release gaps (P1). |
| Security / session | **Medium** | RLS + admin guards OK; idle sign-out disabled; fraud RPC fails open. |
| Merchant UX e2e | **Low–Medium** | Core routes covered; full QR management relies on manual smoke. |
| Ops / backup | **Low** | Rollback and backup docs complete; execution is procedural. |

---

## Remaining blockers (exact)

1. **Live Paystack keys** — Production cutover (`pk_live_` / `sk_live_`) and one small live tip not executed in this validation ([COMPLIANCE_SIGNOFF.md](./COMPLIANCE_SIGNOFF.md), [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md) § Live key rollout).
2. **Cron jobs** — `process-webhook-retries` and `reconcile-daily` not scheduled in Supabase Dashboard ([CRON.md](./CRON.md), [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md) P2-4).
3. **Payout automation** — `request-payout` does not initiate Paystack transfers; admin payout status may not call settle/release RPCs (P1-1, P1-6).
4. **Session idle** — `SessionIdleWatcher` commented out in `src/App.tsx`; set `VITE_SESSION_IDLE_MINUTES` only after re-enable.
5. **Merchant QR UI smoke** — Run manual regenerate/revoke once per Phase 0 merchant on production URL (avoid automated hammering of auth during parallel e2e).

---

## Webhook replay test steps (operator)

Use **Paystack test** mode and a known `paystack_reference` from a completed or failed tip.

1. **Idempotent duplicate**
   - Paystack Dashboard → Webhooks → select a delivered `charge.success` (or `charge.failed`) event.
   - **Resend** the same payload to `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`.
   - Expect HTTP **200** and body containing `"duplicate": true` (second claim returns `claimed = false` in `paystack-webhook/index.ts`).
   - Confirm no double credit: `wallet_accounts` / `tips.status` unchanged.

2. **Failed payment path**
   - Trigger or resend `charge.failed` for a pending tip reference.
   - Expect `tips.status = failed`, `transactions.status = failed`.
   - Customer route: `/payment/failure?reason=...` renders “Not completed”.

3. **Audit trail**
   ```sql
   select provider_event_id, event_type, status, paystack_reference, created_at
   from public.payment_events
   where paystack_reference = '<reference>'
   order by created_at;
   ```

4. **DLQ / retry** (after cron scheduled)
   - Force claim failure or inspect `webhook_retry_queue` in `/admin/fraud`.
   - Invoke `process-webhook-retries` manually; confirm queue drains.

---

## Session idle test steps

1. In Vercel **Preview** or local `.env`: `VITE_SESSION_IDLE_MINUTES=1` (test value).
2. Re-enable `<SessionIdleWatcher />` in `src/App.tsx` (currently disabled for auth bootstrap stability).
3. Sign in as admin or merchant → remain idle (no pointer/keyboard/scroll) for &gt;1 minute.
4. Expect redirect to login / signed-out state without server-side revocation (client-only today).
5. For production beta: recommend **30** minutes for admin roles ([DEPLOY.md](../DEPLOY.md), `.env.example`).

---

## Recommended beta merchant count

**3–10 verified merchants** during Phase 0–1 ([BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)).

| Phase | Cap | Rationale |
|-------|-----|-----------|
| **Pilot (0)** | **1–2** | Single-venue burn-in; webhook DLQ = 0 for 7 days; one payout smoke per guard. |
| **Limited beta (1)** | **≤10** | Hard cap on `merchants.verified = true`; daily `/admin/metrics` review; p95 QR &lt;500ms. |

Start with **3** invited venues after pilot exit: enough to detect Paystack/webhook edge cases without exceeding operator support capacity.

---

## Recommended rollout sequence

| Phase | Duration | Actions |
|-------|----------|---------|
| **0 — Pilot** | 7 days | `pk_test_` only; 1–2 merchants; `npm run verify:*` daily; manual tip + payout; backup Monday check. |
| **0b — Live key cutover** | 1 day | Compliance sign-off → `sk_live_` secrets + `pk_live_` Vercel → one R10 live tip → rollback keys in vault. |
| **1 — Limited beta** | 14 days | Expand to ≤10 merchants; schedule cron; weekly `stress:qr` on production token; freeze new invites if DLQ &gt;0. |
| **2 — Scale** | Ongoing | +10 merchant batches; Sentry flat; [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md). |

---

## Evidence (this run)

```text
verify:supabase  — All checks passed (regenerate_qr_code_token, claim_tip_link_session, payment_events RLS)
verify:paystack  — test keys, webhook HMAC, paystack-verify deployed
stress:qr        — demo-staging-qr-01 × 100: Errors 0, p50 283.6ms, p95 343.5ms
test:e2e         — 21 passed (auth guards, customer demo login, merchant login/routing, QR tip shell, payment failure page)
build + lint     — exit 0
```

---

## GO / NO-GO decision

| Decision | **GO** for **controlled beta (Phase 0 pilot)** on **test Paystack** with manual ops checklists. |
|----------|-----------------------------------------------------------------------------------------------------|
| **NO-GO** for **unrestricted live-money scale** until blockers 1–3 are closed and Phase 0 exit criteria met. |

**Sign-off:** Engineering validation complete 2026-05-22. Product/ops must confirm compliance + backup + live tip before Phase 0b.

---

## Related docs

- [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)
- [BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md)
- [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md)
- [FINAL_LAUNCH_READINESS_REPORT.md](./FINAL_LAUNCH_READINESS_REPORT.md)

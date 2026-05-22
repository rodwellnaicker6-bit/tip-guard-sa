# Final launch readiness — TipGuard SA

**Date:** 21 May 2026  
**Commit:** `dddffef` (`main`)  
**Project:** `fyjmujhlqpvfryelnfum` (Supabase)  
**Validator:** Automated scripts + migration apply + code/doc audit (no experimental features)

---

## Decision: **GO** (with operator prerequisites)

Schema and verification gates pass on the linked production project. Schedule cron jobs, run one live operator tip E2E, and switch Paystack to live keys when approved.

---

## Blockers (max 8)

1. **Cron not scheduled** — `process-webhook-retries` (every 15m) and `reconcile-daily` (daily 02:00 SAST). URLs in [CRON.md](./CRON.md).
2. **Live Paystack keys not validated** — this pass used `pk_test_` / `sk_test_` only (`verify:paystack` exit 0).
3. **Full live payment E2E not executed in this pass** — script verification only; operator must run one tip → webhook → balance check before public launch.
4. **P1 payout integrity** — admin manual payout / Paystack transfer API / reference-level reconcile outstanding ([REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md)).
5. **Beta sign-off** — [BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md) not marked complete on production URL.
6. **Playwright E2E on CI runner** — `npx playwright install` required if running `npm run test:e2e` in CI (not a production schema blocker).
7. **`payment_events` RLS hotfix** — applied on remote via SQL (`revoke select on payment_events from anon` + admin policy); add to next migration bundle if drift repair is re-run elsewhere.
8. **Edge redeploy after migration** — confirm all payment functions deployed post-schema change (commands in [LAUNCH_VALIDATION_REPORT.md](./LAUNCH_VALIDATION_REPORT.md) §6).

---

## Test command results

| Command | Exit | Notes |
|---------|------|-------|
| `npm run verify:paystack` | **0** | HMAC OK; webhook 400 unsigned / 200 signed; 3 transactions |
| `npm run verify:supabase` | **0** | All checks passed (post 50000–70000 + RLS hotfix) |
| `npm run stress:qr` | **0** | p50 254ms, p95 363ms, 0/50 errors |
| `npm run build` | **0** | Vite production build OK |
| `npm run lint` | **0** | ESLint clean |

---

## Migration status

| Item | Status |
|------|--------|
| Drift repair `20260521192141` | Reverted in history |
| `20260624130000` … `20260625170000` | Applied via `supabase db query --linked -f` (+ `drop function resolve_tip_target` before 70000) |
| History parity | `supabase migration list` — local/remote aligned through `20260625170000` |
| Schema parity | `verify:supabase` exit **0** — `regenerate_qr_code_token`, `qr_type`, `claim_tip_link_session`, core tables |

---

## What passed

- Paystack webhook HMAC and Edge reachability
- Idempotent webhook claims + `payment_events` upserts (code paths verified)
- QR resolve stress (50 concurrent, &lt;10% error threshold)
- Admin routes (`RequireAdmin`), `logAdminAction` on fraud admin
- Payout schedule UI (`payout_schedule`, `PayoutSchedulePanel`, migration 50000)
- Merchant onboarding (`MerchantSetup`, KYC, QR print/revoke/regenerate RPC)
- `npm run build` + `npm run lint`

---

## Payment integrity

| Area | Status |
|------|--------|
| Webhook HMAC | Pass (`verify:paystack`) |
| Duplicate delivery | `claim_provider_webhook_event` + legacy claim; `duplicate: true` path |
| Retry queue | `enqueueWebhookRetry` on claim failure; `process-webhook-retries` Edge present |
| Reconciliation | `reconcile-daily` Edge present; cron not yet scheduled |
| Initialize/verify idempotency | `ignoreDuplicates` on `payment_events` upsert |

---

## Recommendation

**GO** for controlled launch after operator completes items 1–3 in blockers (cron, one E2E tip, live keys when ready). **`verify:supabase` exit 0** is satisfied.

---

## Related docs

- [LAUNCH_VALIDATION_REPORT.md](./LAUNCH_VALIDATION_REPORT.md) — full cycle, Edge deploy commands, idempotency
- [CRON.md](./CRON.md) — exact Supabase Cron URLs for `fyjmujhlqpvfryelnfum`
- [MONITORING.md](./MONITORING.md) — alerts and audit SQL
- [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md) — drift repair notes

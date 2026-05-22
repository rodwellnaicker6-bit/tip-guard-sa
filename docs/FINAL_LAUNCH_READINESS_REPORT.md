# Final launch readiness — TipGuard SA

**Date:** 21 May 2026  
**Commit:** `79f1b00` (`main`)  
**Validator:** Automated scripts + code/doc audit (no experimental features)

---

## Decision: **NO-GO**

Production launch should wait until migration `20260625170000_merchant_ops_launch.sql` is applied on `fyjmujhlqpvfryelnfum` and `npm run verify:supabase` passes. Payment webhook path is otherwise healthy on test keys.

---

## Blockers (max 10)

1. **`20260625170000_merchant_ops_launch.sql` not applied on remote** — `verify:supabase` fails: missing `qr_codes.revoked_at` / `qr_type`, missing RPC `regenerate_qr_code_token`.
2. **Cron not scheduled** — `process-webhook-retries` (15m) and `reconcile-daily` per [CRON.md](./CRON.md) / [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md).
3. **Live Paystack keys not validated** — this pass used `pk_test_` / `sk_test_` only.
4. **Full live payment E2E not executed in this pass** — script verification only; operator must run one tip → webhook → balance check before GO.
5. **Playwright E2E unavailable in CI runner** — `npx playwright install` required; 18 specs failed on missing browser binary (not app regression).
6. **P1 payout integrity** — admin manual payout / Paystack transfer API / reference-level reconcile outstanding ([REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md)).
7. **Beta sign-off** — [BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md) not marked complete on production URL.
8. **`payment_events` QR audit chain** — confirm `payment_events` table + `touch_qr_code` audit path on remote if not already from earlier migrations ([REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md)).

---

## Test command results

| Command | Exit | Notes |
|---------|------|-------|
| `npm run verify:paystack` | **0** | HMAC OK; webhook 400 unsigned / 200 signed; 3 transactions |
| `npm run verify:supabase` | **1** | 2 failures — 70000 migration |
| `npx tsx scripts/stress-qr-resolve.ts demo-staging-qr-01 50` | **0** | p50 281ms, p95 354ms, 0 errors |
| `npm run build` | **0** | Vite production build OK |
| `npm run lint` | **0** | ESLint clean |
| `npm run test:e2e` | **1** | Playwright chromium not installed |

---

## What passed

- Paystack webhook HMAC and Edge reachability
- `claim_tip_link_session`, `resolve_tip_target`, idempotent webhook claims + `payment_events` upserts (code)
- All `/admin/*` routes use `RequireAdmin`
- `npm run build` + `npm run lint`
- QR resolve stress (50 calls, &lt;10% error threshold)
- Merchant docs (`PRINTABLE_QR_KIT`, `MERCHANT_ONBOARDING_GUIDE`, `DEMO_ENVIRONMENT`)
- Admin metrics/fraud UIs present

---

## Unblock steps (minimal)

1. Apply migrations through `20260625170000` on production project → `npm run verify:supabase` must exit 0.
2. Deploy Edge functions listed in [LAUNCH_VALIDATION_REPORT.md](./LAUNCH_VALIDATION_REPORT.md) §6.
3. Schedule cron POSTs for `process-webhook-retries` and `reconcile-daily`.
4. Run one operator E2E tip on test keys; then switch to live keys when approved.
5. `npx playwright install && npm run test:e2e` on release machine.

---

## Related docs

- [LAUNCH_VALIDATION_REPORT.md](./LAUNCH_VALIDATION_REPORT.md) — full cycle, idempotency, monitoring SQL
- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) — updated launch gates
- [MONITORING.md](./MONITORING.md) — alerts and audit queries

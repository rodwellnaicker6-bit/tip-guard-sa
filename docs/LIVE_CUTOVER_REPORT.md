# TipGuard SA - Live Cutover Report

**Date:** 2026-05-27  
**Production URL:** https://tipguardsa.co.za  
**Supabase project:** `fyjmujhlqpvfryelnfum`  
**Current payment mode:** `test` (from `/api/debug-env`)  
**Recommendation:** **NO-GO for live money cutover**; **GO for controlled test-mode release**

---

## Live readiness %

- **Overall readiness:** **88%**
- **Why not 100% yet:** manual signed-in production E2E is not complete in this environment, and Supabase security advisors still report unresolved `ERROR`/`WARN` items.

---

## What was verified now

### Automated stabilization and safety gates

- `npm run lint` -> PASS
- `npm run build` -> PASS
- `npm run readiness` -> PASS (10/10)
- `npm run verify:supabase` -> PASS
- `npm run verify:paystack` -> PASS
- `npm run smoke:production` -> PASS

### Production path checks

- `GET /` -> 200
- `GET /api/debug-env` confirms production deploy and `mode: test`
- Low-network fetch simulation (`curl --limit-rate`) on QR page completed successfully
- HTTPS/security headers observed on production:
  - `strict-transport-security`
  - `x-frame-options: DENY`
  - `x-content-type-options: nosniff`
  - `referrer-policy: strict-origin-when-cross-origin`

### Payment and payout security path checks

- `paystack-webhook` verifies HMAC signature (`x-paystack-signature`) before processing.
- `paystack-verify` and `request-payout` require JWT/session and enforce per-user rate limits.
- Payout flow includes hold/reverse/settle safeguards (`hold_guard_payout`, `reverse_guard_payout_hold`, `settle_guard_payout_hold`).
- Edge logs show expected behavior:
  - `paystack-webhook` 200 on valid signed payload and 400 on invalid signature.
  - `paystack-verify` 401 without auth (expected).

### Observability / telemetry

- Runtime marker present in prod: `paymentParserMarker: edgeFunctionInvoke-v1`.
- Sentry initialization is gated by `VITE_SENTRY_DSN` and disabled for events in dev.
- Payment debug logs are gated (`VITE_DEBUG_PAY` / boot debug), reducing production noise risk.
- No high-risk dev bypass toggles were found in active prod codepaths (spot check for `DEBUG`, `BYPASS`, `SKIP_AUTH`, `DEV_ONLY` markers).

---

## Manual signed-in E2E status (best effort)

Attempted automated E2E (`npm run test:e2e`) in this environment, but browser worker teardown repeatedly timed out, so reliable signed-in path completion could not be proven here.

### Operator checklist (required before live cutover)

- [ ] New signup (real new user), verify confirmation/login path
- [ ] Onboarding completion (all required steps)
- [ ] QR generation from merchant path
- [ ] End-to-end payment on QR (Paystack test mode) to success page
- [ ] Payout request from eligible guard account
- [ ] Payout verification in admin/ops workflow
- [ ] Logout/login cycle validation
- [ ] Session persistence after hard refresh and browser restart
- [ ] Mobile browser run (iOS Safari + Android Chrome minimum)
- [ ] Low-network run on QR and payment path (3G/slow profile)

---

## QR -> Paystack -> payout lifecycle status

- **Codepath and infra checks:** PASS
- **Production signed-in human flow:** PENDING (operator execution required)
- **Cutover interpretation:** safe to continue with test-mode controlled release; do not switch to live keys until manual lifecycle checklist is green.

---

## Paystack cutover gating

- **Current state:** keep `pk_test_` / `sk_test_` in production until final verification is complete.
- **Do not switch keys** unless explicitly instructed and live keys are available in secure secret stores.

### Live key swap procedure (do not execute yet)

1. Confirm all GO criteria in this report are checked.
2. Update Supabase secret `PAYSTACK_SECRET_KEY` to `sk_live_*`.
3. Update Vercel `VITE_PAYSTACK_PUBLIC_KEY` to `pk_live_*` and set `VITE_PAYSTACK_TEST_MODE=false`.
4. Redeploy edge functions (`paystack-initialize`, `paystack-verify`, `paystack-webhook`, `request-payout`) and frontend.
5. Run one live-canary payment and one payout verification under operator supervision.
6. Monitor edge logs and payment event table for 15-30 minutes before broader rollout.

---

## Security checks status

### Supabase RLS/advisories (current)

- **Open `ERROR`:**
  - `security_definer_view` on `public.payouts`
  - `security_definer_view` on `public.tip_transactions`
- **Open `WARN` (high-signal examples):**
  - mutable search path on `run_fraud_checks`
  - broad public bucket listing policy on `guard-photos`
  - multiple `SECURITY DEFINER` functions executable by `anon`/`authenticated` (intentional for some public RPCs, but requires explicit allowlist review)
  - leaked-password protection disabled in Supabase Auth
- **Implication:** do not classify security hardening as complete yet.

### Payout role checks

- `request-payout` requires authenticated user and a linked guard profile.
- Non-guard caller path is blocked (`403 Guard profile required`).
- Rate limits present for payout and verify paths.

### Onboarding under production conditions

- Automated checks and prior reports indicate onboarding RPC and fallback are active.
- **Still required:** human validation in production with fresh accounts.

---

## Pre-cutover safety tasks

### Rollback snapshot instructions

1. Record current production `gitSha` from `/api/debug-env`.
2. Record current edge function versions (`list_edge_functions` snapshot).
3. Export current environment variable key list (names only, no values).
4. Save this report and deployment ID for rollback reference.

### DB backup/export instructions

- Supabase Dashboard -> Project -> Database -> Backups:
  - confirm latest automated backup timestamp
  - trigger on-demand backup before key cutover (if plan supports it)
- Optional logical export (operator-run):
  - `pg_dump` of critical tables (`tips`, `transactions`, `payment_events`, `payout_requests`, `platform_settings`)

### Env secret presence (without values)

- Frontend env presence checks passed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`).
- Paystack secret presence checks passed in verification scripts (`PAYSTACK_SECRET_KEY` available to edge runtime).

### Rate limits and transport/security headers

- Rate limiting confirmed in key edge routes:
  - `request-payout` (user scoped)
  - `paystack-verify` (user scoped)
  - `paystack-webhook` (IP scoped)
- HTTPS/security headers verified on production root response.

### Webhook endpoint + signature checks

- Endpoint: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`
- Signature enforcement present and validated (bad signature -> 400; valid signature -> 200).

### Edge function logs procedure

1. Open Supabase project `fyjmujhlqpvfryelnfum`.
2. Go to Logs -> Edge Functions.
3. Filter for:
   - `paystack-initialize`
   - `paystack-verify`
   - `paystack-webhook`
   - `request-payout`
4. Confirm expected status patterns:
   - webhook: signed requests 200, invalid probes 400
   - verify: unauthorized probes 401, valid signed-in verifies 200

### Mobile usability basics

- Mobile viewport behavior was not fully validated with authenticated flows in this run.
- Require manual iOS Safari and Android Chrome checklist completion before live cutover.

---

## Auth stability

- Session and auth checks pass in automated verification.
- Signed-in persistence and relogin flow still require manual production confirmation on real devices.

---

## Runtime stability

- Current runtime gates are green; no blocking build/lint/smoke failures.
- Production smoke and readiness checks indicate stable runtime for controlled release mode.

---

## Payment readiness

- **Test-mode readiness:** PASS
- **Live-mode readiness:** PENDING manual E2E + security cleanup + explicit key cutover approval

---

## Known remaining warnings

1. Manual signed-in E2E and real-device mobile path not fully executed in this environment.
2. Supabase security advisor still reports unresolved `ERROR` and several `WARN` findings.
3. Playwright E2E runner instability (worker teardown timeouts) prevents reliable automated sign-off.

---

## GO criteria checklist

- [x] Build/lint/readiness/smoke all pass
- [x] Webhook signature verification confirmed
- [x] Payment verify/auth gates confirmed
- [x] Payout auth/role and rate-limit path confirmed
- [x] Production HTTPS/security headers confirmed
- [x] Test keys still active (no accidental live cutover)
- [ ] Manual signed-in E2E complete (signup -> onboarding -> QR -> pay -> payout)
- [ ] Mobile authenticated checks complete (iOS + Android)
- [ ] Supabase security `ERROR` items resolved or formally risk-accepted by owner
- [ ] Live key cutover approved and runbook sign-off complete

---

## NO-GO blockers

1. Manual signed-in E2E lifecycle not fully executed and signed off.
2. Supabase security advisor still returns unresolved `ERROR` items.
3. Live key cutover approval and final canary validation not yet complete.

---

## Final recommendation

- **GO** for continued controlled release in **test payment mode**.
- **NO-GO** for switching to **live Paystack keys** until all checklist items and blockers above are cleared.

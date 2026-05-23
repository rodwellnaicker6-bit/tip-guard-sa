# Final production hardening — TipGuard SA

**Date:** 22 May 2026  
**Branch:** `main`  
**Base commit audited:** `5c69120`  
**Supabase project:** `fyjmujhlqpvfryelnfum`  
**Strategy:** Schema/RLS audit, automated verify scripts, minimal P0 code fixes only — no redesign, no new experimental tables.

---

## Executive summary

| Metric | Result |
|--------|--------|
| **P0 fixes in this pass** | **1** — `/contact` route + footer link (checklist gap; no schema change) |
| **GO for Paystack review** | **YES** (test mode) — HMAC, Edge reachability, idempotency code paths verified; live keys + one operator tip E2E still required before `pk_live_` |
| **Automated gates** | `build` 0 · `lint` 0 · `verify:supabase` 0 · `verify:paystack` 0 · `stress:qr` 0 (20 iter) |
| **E2E** | **BLOCKED (env)** — Playwright browsers not installed in runner (`npx playwright install`); not a production schema blocker |
| **Commit (this pass)** | See git log after push |

---

## Checklist name mapping (external → actual schema)

Do **not** create parallel `venues` / `sites` / `devices` / `qr_links` tables. Use existing names:

| Checklist / legacy name | Actual in repo | Notes |
|-------------------------|----------------|-------|
| `venues` | `merchants` + view `venues` | `venues` is read-only alias (`20260624140000_fintech_production_mvp.sql`) |
| `sites`, `locations` | `merchant_locations` | Merchant branches / precincts |
| `qr_links` | `tip_links` | Guard short links (`/t/:token`) |
| QR codes (merchant/guard) | `qr_codes` | `code_token`, `qr_type`, `expires_at`, `revoked_at` |
| `devices` | **N/A** (POST-LAUNCH) | `rfid_tags` scaffold only; no device registry table |
| `payouts` | `payout_requests` | Wallet holds via `wallet_accounts` |
| `users` | `auth.users` + `profiles` | Role in `profiles.role` |
| `admin_audit` | `admin_audit_log` | RPC `log_admin_audit` |
| `audit_log` | `audit_log` | Stub; Edge not fully wired ([AUDIT_LOG.md](./AUDIT_LOG.md)) |
| `payment_events` | `payment_events` | Init/verify/webhook + `tipguard` scan audit |
| Stripe-era | `stripe_webhook_events` | Legacy; Paystack uses `paystack_webhook_events` + `claim_provider_webhook_event` |

**Full public tables (migrations):** `profiles`, `guards`, `tips`, `tip_links`, `customers`, `merchants`, `merchant_locations`, `qr_codes`, `rfid_tags`, `transactions`, `payment_events`, `paystack_webhook_events`, `payout_requests`, `wallet_accounts`, `customer_wallets`, `platform_settings`, `tip_sessions`, `notifications`, `subscriptions`, `referrals`, `loyalty_wallets`, `loyalty_ledger`, `kyc_cases`, `analytics_events`, `activity_logs`, `fraud_rules`, `fraud_events`, `disputes`, `admin_audit_log`, `audit_log`, `webhook_retry_queue`, `reconciliation_log`, `api_rate_log`, `merchant_invites`, `stripe_webhook_events` (legacy).

**POST-LAUNCH (missing vs generic fintech checklist):** dedicated `devices` table, unified `payouts` ledger table, real-time admin Realtime channel, full `notify-payment` fan-out, Paystack Transfer API automation.

---

## Sections 1–18 (mega checklist)

### 1. Database schema & migrations — **PASS**

- 27 migration files through `20260625210000_onboarding_role_pick.sql`.
- `npm run verify:supabase` exit **0** — core tables, RPCs, `qr_codes` launch columns, `guard-photos` bucket.
- **Operator:** ensure remote history includes `20260625180000` (payment_events anon revoke) through `20260625210000` if not yet pushed: `npm run db:push` or Dashboard SQL.

### 2. RLS & tenant isolation — **PASS** (with documented caveats)

- [RLS_AUDIT.md](./RLS_AUDIT.md) + [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md).
- `payment_events`: anon SELECT revoked (`20260625180000_payment_events_rls_hotfix.sql`); verify script confirms anon blocked.
- `tips`: client writes blocked by `tips_require_privileged_writer`.
- **Caveat (POST-LAUNCH):** `guards_select_authenticated` still exposes full guard rows to any signed-in user; prefer `guards_public_directory` / RPC when revoking.

### 3. Authentication (customers, guards, merchants, admins) — **PASS**

- Signup → `handle_new_user` → `profiles.role = customer`; onboarding may set guard/merchant (`20260625210000_onboarding_role_pick.sql`).
- Demo users: `npm run seed:demo` (4× `@tipguard.staging`).
- Password reset: `/forgot-password`, `/auth/reset`, `/auth/callback`.

### 4. Protected routes & session — **PASS**

- `RequireAuth`, `RequireGuard`, `RequireMerchant`, `RequireAdmin` in `src/App.tsx`.
- E2E specs exist under `e2e/` (runner needs Playwright browsers).

### 5. Paystack configuration — **PARTIAL**

- `verify:paystack` exit **0** (test keys): API, HMAC webhook, `paystack-verify` deployed.
- **Gap:** `pk_live_` / `sk_live_` not validated in this pass.

### 6. Webhook idempotency & retry — **PARTIAL**

- `paystack-webhook`: `claim_provider_webhook_event` → legacy `claim_paystack_webhook_event`; duplicate → `200` `{ duplicate: true }`.
- `webhook_retry_queue` + `process-webhook-retries` Edge present.
- **Gap:** Cron not scheduled ([CRON.md](./CRON.md)); full replay into webhook handler still stub.

### 7. QR & tip resolution — **PASS**

- Routes: `/tip/:token`, `/qr/:token`, `/t/:token` (resolve), `/merchant/qr`, `/guard/qr`.
- RPCs: `resolve_tip_target`, `touch_qr_code`, `claim_tip_link_session`, `regenerate_qr_code_token`.
- Stress: 20× `demo-staging-qr-01` — 0 errors, p95 644ms.

### 8. Payouts & wallet integrity — **PARTIAL**

- `request-payout` Edge, `payout_requests`, `wallet_accounts`, schedule UI.
- `admin_update_payout_status` wires settle/release holds (`20260625200000_launch_cron_admin_payout.sql`) — **must be applied on remote** if not already.
- **Gap:** No Paystack Transfer API in `request-payout`; reference-level reconcile (P1).

### 9. Merchant onboarding & locations — **PASS**

- `/merchant/setup`, `/merchant/locations`, `/merchant/kyc`, `/merchant/guards`, `/merchant/qr`.
- Data: `merchants`, `merchant_locations`, `merchant_invites`.

### 10. Admin control panel — **PASS**

- `/admin`, `/admin/metrics`, `/admin/fraud`, `/admin/transactions`, `/admin/analytics`, `/admin/security`.
- Payout actions use `admin_update_payout_status` RPC.

### 11. Transaction logging & analytics — **PARTIAL**

- `payment_events`, `transactions`, `activity_logs`, `admin_audit_log`.
- Merchant analytics: `merchant_payment_analytics_v2` (polling).
- **Gap:** `audit_log` Edge wiring incomplete; admin Realtime dashboard (POST-LAUNCH).

### 12. Fraud & rate limiting — **PARTIAL**

- `run_fraud_checks`, `fraud_events`, `/admin/fraud`; Edge `rateLimit.ts` on payment routes.
- **Gap:** Fail-open on RPC error; no WAF/CDN rules documented.

### 13. Monitoring, health & cron — **PARTIAL**

- `health` Edge, Sentry optional, [MONITORING.md](./MONITORING.md).
- **Gap:** `process-webhook-retries` + `reconcile-daily` cron not scheduled.

### 14. Legal & compliance pages — **PARTIAL**

- `/terms`, `/privacy`, `/legal/popia`, `/legal/refunds`, `/legal/cookies`, `/legal/merchant`.
- **This pass:** `/contact` + `VITE_SUPPORT_EMAIL` optional.
- **Gap:** Counsel sign-off ([COMPLIANCE_LAUNCH_READINESS.md](./COMPLIANCE_LAUNCH_READINESS.md)).

### 15. Mobile / PWA — **PARTIAL**

- Manifest, lazy routes, touch targets, offline banner.
- **Gap:** Lighthouse LCP on `/` ([PERFORMANCE.md](./PERFORMANCE.md)); service worker POST-LAUNCH.

### 16. Performance & indexes — **PASS**

- `20260621110000_launch_stability_indexes.sql`, QR indexes in `20260625160000` / `20260625170000`.
- Build chunking in Vite config.

### 17. Deployment & environment — **PARTIAL** (operator)

- Client (Vercel): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` — never `sk_*` or service role on Vercel.
- Edge secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL`.
- See **Operator steps** below.

### 18. Automated verification & E2E — **PARTIAL**

| Command | Exit | Notes |
|---------|------|-------|
| `npm run build` | 0 | |
| `npm run lint` | 0 | |
| `npm run verify:supabase` | 0 | |
| `npm run verify:paystack` | 0 | test keys |
| `npm run stress:qr` | 0 | 20 iterations |
| `npm run test:e2e -- --workers=1` | fail | Playwright browser binary missing in CI/sandbox |

---

## P0 fixes applied in this pass

| # | Fix | Files |
|---|-----|-------|
| 1 | Add `/contact` route (checklist: support/contact page missing) | `src/pages/Contact.tsx`, `src/App.tsx`, `src/pages/Landing.tsx`, `.env.example` |

**Not changed (already in repo / operator-only):** `payment_events` RLS hotfix migration; Paystack webhook idempotency; no new `venues`/`sites`/`devices` tables.

---

## Paystack review readiness checklist

Use this when submitting Paystack merchant / live-key review:

- [ ] **Business URL** live on Vercel with valid TLS
- [ ] **Terms, Privacy, Refunds, POPIA** linked from footer (including **Contact**)
- [ ] **Webhook URL:** `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`
- [ ] **Events:** `charge.success`, `charge.failed` (and transfer events if payouts automated later)
- [ ] **HMAC:** `verify:paystack` passes on deployed Edge (unsigned → 400, signed → 200)
- [ ] **Test tip E2E:** initialize → Paystack test card → webhook → `tips.status = succeeded` → guard/wallet balance
- [ ] **Idempotency:** duplicate webhook returns success without double credit
- [ ] **PCI scope:** hosted/inline Paystack only; no PAN in SPA
- [ ] **Support email** on `/contact` matches production operator (`VITE_SUPPORT_EMAIL`)
- [ ] **Live keys:** `pk_live_` on Vercel; `sk_live_` in Supabase secrets only; redeploy Edge after secret change
- [ ] **Cron:** webhook retry + daily reconcile scheduled before high volume

**Review GO (test):** YES — automated checks green. **Live GO:** after one documented production tip + cron scheduled.

---

## Operator steps (deploy / validate)

1. **Vercel Production env** (redeploy after change):
   - `VITE_SUPABASE_URL=https://fyjmujhlqpvfryelnfum.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` (publishable/anon)
   - `VITE_PAYSTACK_PUBLIC_KEY` (`pk_test_` until UAT done)
   - Optional: `VITE_DEMO_MODE`, `VITE_SUPPORT_EMAIL`, `VITE_PAYSTACK_TEST_MODE`

2. **Supabase**
   ```bash
   npm run db:push   # or db:push:api with SUPABASE_ACCESS_TOKEN
   ```
   Confirm through `20260625210000_onboarding_role_pick.sql`.

3. **Edge secrets & deploy**
   ```bash
   supabase secrets set PAYSTACK_SECRET_KEY="sk_..." PUBLIC_APP_URL="https://your-domain.com"
   supabase functions deploy paystack-initialize paystack-webhook paystack-verify request-payout process-webhook-retries reconcile-daily
   ```

4. **Auth URLs** (Dashboard or `npm run auth:configure`): Site URL, `/auth/callback`, `/auth/reset`.

5. **Cron** — [CRON.md](./CRON.md) or `scripts/schedule-cron-jobs.sql`.

6. **Demo seed** (staging): `npm run seed:demo` → test `/tip/demo-staging-qr-01`.

7. **Verify**
   ```bash
   npm run verify:supabase && npm run verify:paystack && npm run build
   npx playwright install && npm run test:e2e -- --workers=1
   ```

---

## Top 10 gaps (post-launch)

1. Schedule Supabase Cron (`process-webhook-retries`, `reconcile-daily`).
2. Live Paystack E2E on production URL (one real tip + balance check).
3. Paystack Transfer API / automated guard payouts (`request-payout`).
4. Reference-level Paystack reconciliation (not aggregate-only).
5. Push/email notifications (`notify-payment`, Resend/VAPID).
6. Revoke broad `guards_select_authenticated`; clients use directory view/RPC.
7. Legal counsel sign-off on Terms/Privacy/Refunds/POPIA copy.
8. Beta tester sign-off on production URL ([BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md)).
9. Service worker + Lighthouse/LCP polish on landing.
10. `devices` / NFC hardware registry (only `rfid_tags` scaffold today).

---

## Related docs

- [FINAL_LAUNCH_READINESS_REPORT.md](./FINAL_LAUNCH_READINESS_REPORT.md)
- [YIELD_CORE_LAUNCH_PHASE.md](./YIELD_CORE_LAUNCH_PHASE.md)
- [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md)
- [DEPLOYMENT_FINAL.md](./DEPLOYMENT_FINAL.md)

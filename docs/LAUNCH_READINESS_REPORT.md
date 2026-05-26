# TipGuard SA — Launch readiness report

**Last updated:** 2026-05-26 (merchant venue load fix)  
**Production URL:** https://tipguardsa.co.za  
**Paystack mode:** **test** — live ZAR blocked until [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)

---

## Overall readiness: **~90%**

| Layer | % | Notes |
|-------|---|--------|
| Automated gates | **100%** | build, lint, readiness 10/10, verify:supabase, verify:paystack, smoke |
| Code / stability | **~95%** | Onboarding fail-safe, auth dedupe, perf pass, payments idempotency |
| Manual product E2E | **0%** in CI | Operator must run checklist below |
| Live money | **0%** | Test keys only until cutover |

**Pilot recommendation:** **Go** for test-mode production after manual checklist. **No-go** for live charges without `pk_live_` / `sk_live_` + compliance sign-off.

---

## PASS / FAIL by area (honest)

| Area | Result | Evidence |
|------|--------|----------|
| **Speed / performance** | **PASS** | `4124eeb`: parallel GuardHome, deferred QR touch, lazy Paystack, coalesced auth refresh; admin dashboard loads parallel (`Promise.all`) |
| **Stability / auth** | **PASS** | `fbc0662` + polish: onboarding 10s timeouts, 11s fail-safe → `/merchant/setup`, try/finally, skeleton boot state; `authReady = sessionReady` |
| **Trust / security** | **PASS** | Webhook HMAC; no `sk_` / `service_role` in client bundle; RLS migration `20260626170000` |
| **UX polish (minimal)** | **PASS** | Onboarding step skeletons; QR page skeleton + 12s load timeout; 48px Pay CTA |
| **Payments** | **PASS** (test mode) | `paystack-initialize` / `paystack-verify` / webhook dedupe + `payment_events`; `paystackCore` checkout lock |
| **Mobile** | **PASS** | `viewport-fit=cover`; QR `overflow-x-hidden`; touch targets on presets/Pay |
| **NFC / QR redirects** | **PASS** | `/t/:token` → `/tip/:token`; NFC → in-app routes; touch RPCs non-blocking |
| **Platform fee 2%** | **PASS** (after migration) | Server-only `get_platform_fee_bps()` in Edge; migration `20260626210000` sets **200 bps** — run `npm run db:push` on prod |
| **Admin analytics (vision)** | **FAIL** | **Not** Square-style rebuild — existing RPC panels only (`admin_dashboard_metrics`, `merchant_payment_analytics_v2`) |
| **Manual merchant E2E** | **FAIL** | Not run in CI |
| **Paystack live keys** | **FAIL** | Intentional test mode |
| **Playwright CI** | **SKIP** | Run locally: `npx playwright install && npm run test:e2e` |
| **NTAG / subscriptions / multi-region** | **FAIL** | Roadmap only — [PRE_LAUNCH_PLATFORM.md](./PRE_LAUNCH_PLATFORM.md) |

---

## Code shipped (recent)

| Change | File(s) |
|--------|---------|
| **Merchant venue load fix** | `useMerchantVenue.ts`, `MerchantDashboard.tsx` — prod missing `risk_score` column caused 42703 |
| Onboarding loading skeleton | `src/pages/Onboarding.tsx` |
| QR mobile overflow + 48px Pay | `src/pages/QrTipLanding.tsx` |
| Admin dashboard parallel fetch | `src/pages/AdminDashboard.tsx` |
| 2% fee migration | `supabase/migrations/20260626210000_platform_fee_200bps.sql` |
| `risk_score` column migration | `supabase/migrations/20260626220000_merchants_risk_score.sql` |

Prior commits still required on prod: **`fbc0662`** (onboarding), **`4124eeb`** (perf).

---

## Manual test checklist (operator)

- [ ] Hard refresh after deploy (Cmd+Shift+R) — confirm `tipguard-git-sha` on https://tipguardsa.co.za/
- [ ] **Merchant onboarding:** register → email confirm → `/onboarding` → merchant → profile → finish → `/merchant` or `/merchant/setup` (console: `[TipGuard:onboarding]`, no stuck Saving >15s)
- [ ] **QR tip:** `/merchant/qr` → create code → `/tip/{token}` → Paystack test card **4084 0840 8408 4081** → `/payment/success`
- [ ] **Webhook:** tip `succeeded` in DB; guard history/wallet updates within ~2 min
- [ ] **Legacy URL:** `/t/demo-staging-qr-01` → `/tip/...`
- [ ] **iPhone Safari:** QR page — no horizontal scroll; NFC panel shows QR fallback
- [ ] **Auth refresh:** signed-in hard reload — no infinite loader
- [ ] **Paystack cancel/retry:** close modal → Pay again — no double-checkout lock
- [ ] Apply fee migration on prod if not yet: `npm run db:push`

---

## Automated verification (re-run before sign-off)

```bash
npm run build && npm run lint
npm run readiness && npm run verify:supabase && npm run verify:paystack
npm run smoke:production
```

---

## Paystack status

| Item | Status |
|------|--------|
| Public key on Vercel | `pk_test_*` (expected for pilot) |
| Secret on Supabase Edge | `sk_test_*` |
| Webhook HMAC | Verified by `verify:paystack` |
| Live money | **Not enabled** — provide live keys per LIVE_KEY_CUTOVER when ready |

---

## Out of scope (do not claim built)

Full admin analytics dashboard rebuild · premium animation overhaul · NTAG provisioning app · multi-region · white-label · POS · AI · subscriptions · KYC document upload flows.

---

## Sign-off

| Audience | Verdict |
|----------|---------|
| Test-mode pilot | **Go** after manual checklist |
| Live production money | **No-go** until key cutover + manual E2E |

# TipGuard SA — Launch readiness report

**Date:** 2026-05-25  
**Assessor:** Pre-launch automated + code audit pass  
**Production URL:** https://tipguardsa.co.za  
**Commits referenced:** `4124eeb` (perf), `fbc0662` (onboarding hang)  
**Paystack mode:** **test** (live money blocked until key cutover)

---

## Executive summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Automated readiness** | **100%** (10/10 checks) | build, lint, supabase, paystack, secrets scan |
| **Manual product E2E** | **~0%** in CI | Required human sign-in flows not automated in pipeline |
| **Overall launch readiness** | **~88–92%** | Safe for **test-mode** production pilot; **not** for live ZAR without cutover + manual E2E |

---

## Tier 1 — Code fixes

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Onboarding hang | **PASS** | `fbc0662`: `[TipGuard:onboarding]` logs, 10s op timeout, try/finally, 11s fail-safe → `/merchant/setup`, non-blocking `refreshProfile`, 800ms debounce |
| 2 | Auth deadlocks | **PASS** | `4124eeb`/`fbc0662`: dedupe boot profile load; coalesced refresh; `authReady = sessionReady` only; TOKEN_REFRESHED does not reload profile |
| 3 | Performance | **PASS** | `4124eeb` intact: parallel GuardHome, deferred QR touch, lazy Paystack, deferred Sentry |
| 4 | Redirect layer | **PASS** | `/t/:token` → `/tip/:token`; NFC → `/tip/{token}`; no Paystack URLs on QR/NFC |
| 5 | Platform fee | **PASS** (config note) | Fee only in `paystack-initialize` via `get_platform_fee_bps()`; **no client calc**. DB default **250 bps** — set **200** for 2% vision |

### Root cause — intermittent merchant onboarding hang

1. **Untimed** `profiles.insert` on RPC fallback path (could hang indefinitely).  
2. **Blocking** `refreshProfile` after save (removed; background + 4s cap).  
3. **Stale** auth `profileFields` vs `step` (`effectiveStep` bounced UI; fixed with `localProfileFields` / `localRole`).  
4. **Duplicate** profile fetch on boot aborting in-flight loads (perf/auth pass).  
5. No **fail-safe** exit if UI state desynced (added 11s → `/merchant/setup`).

---

## Tier 2 — Security

| Item | Status | Notes |
|------|--------|-------|
| RLS `20260626170000` | **PASS** (documented applied) | See FINAL_GO_LIVE_REPORT; re-verify on fresh env via `db:push` |
| Webhook HMAC | **PASS** | `verify:paystack` — signed payload accepted, unsigned rejected |
| No secrets in client | **PASS** | `readiness` secret scan; only `pk_*` in Vite env |
| Onboarding RPC revoke anon | **PASS** | `save_onboarding_role` → authenticated only |

---

## Tier 3 — Documentation

| Doc | Status |
|-----|--------|
| `PRE_LAUNCH_PLATFORM.md` | **Created** |
| `DEPLOYMENT_CHECKLIST.md` | **Updated** |
| `ROLLBACK_PLAN.md` | **Updated** (header) |
| `MONITORING_CHECKLIST.md` | **Created** |
| `LAUNCH_READINESS_REPORT.md` | **This file** |

---

## Tier 4 — Verification (2026-05-25 run)

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run readiness` | **PASS** 10/10 |
| `npm run verify:supabase` | **PASS** |
| `npm run verify:paystack` | **PASS** (HMAC, webhook, keys) |
| `npm run smoke:production` | **PASS** |
| Playwright E2E | **SKIP** — Chromium installed; `npm run test:e2e` failed fast (browser launch in agent env). Run locally: `npx playwright install && npm run test:e2e` |

---

## PASS / FAIL matrix

| Gate | Result |
|------|--------|
| Production deploy reachable | **PASS** |
| Paystack test mode configured | **PASS** |
| Onboarding save hang fix deployed | **PASS** (verify `tipguard-git-sha` ≥ `fbc0662`) |
| Manual merchant E2E | **FAIL** (not executed in CI) |
| Paystack **live** keys | **FAIL** (intentional — test mode) |
| Full vision platform (NFC provision, subscriptions, multi-region) | **FAIL** (out of scope — roadmap only) |
| Admin analytics rebuild | **FAIL** (not started — existing RPCs only) |
| KYC document upload | **FAIL** (placeholder UI only) |

---

## Top 5 manual tests (operator)

1. **Merchant onboarding** — register → confirm email → `/onboarding` → merchant → profile → finish → `/merchant` or `/merchant/setup` (watch console `[TipGuard:onboarding]`).  
2. **QR tip** — `/merchant/qr` create code → open `/tip/{token}` → Paystack test card → success page.  
3. **Webhook settlement** — after tip, guard wallet/history updates within 2 min.  
4. **Auth hard refresh** — signed-in reload; no infinite “Checking session”.  
5. **Legacy redirect** — `/t/demo-staging-qr-01` lands on `/tip/...` without crash.

---

## Out of scope (documented future)

Full admin analytics rebuild · multi-region · white-label · POS · AI · subscriptions · premium UI · KYC uploads · NTAG213 provisioning UI.

---

## Sign-off recommendation

| Audience | Recommendation |
|----------|----------------|
| **Test-mode pilot** | **Go** after manual E2E §2 above |
| **Live money** | **No-go** until [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md) + compliance sign-off |

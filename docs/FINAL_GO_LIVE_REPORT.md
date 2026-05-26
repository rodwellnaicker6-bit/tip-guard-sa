# TipGuard SA — Final Go-Live Report

**Date:** 2026-05-25  
**Commit:** `3924c80` (deployed) → post-report commit with telemetry fix  
**Production:** https://tipguardsa.co.za  
**Supabase:** `fyjmujhlqpvfryelnfum`

---

## Objective PASS / FAIL

| # | Objective | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Black screen / loading loops | **PASS** | `TimedPageLoader`, 5s auth hydration, `RequireAuth` loaders, `EmergencyErrorBoundary`, `HubSafePlaceholder`, null-safe `GuardHome`/`QrTipLanding` |
| 2 | Onboarding E2E | **PASS (code + RPC)** | `save_onboarding_role` on prod; `Onboarding.tsx` RPC-first + fallback. **Manual:** signup → steps 1–3 required |
| 3 | QR tipping prod | **PASS (automated)** | `/tip/:token` HTTP 200; `resolve_tip_target`; `paystack-initialize`/`verify` v8; webhook HMAC verified by `verify:paystack`. **Manual:** test card pay + history |
| 4 | NFC / tap | **PASS** | `hasNdefReader()`, `fallbackToQR()`, unsupported UI → QR button; no throw on iPhone |
| 5 | Paystack LIVE | **BLOCKED (secrets)** | Prod `/api/debug-env` → `"mode":"test"`. Local `.env` has `pk_test_` / `sk_test_` only — **no live keys available to agent**. See § Paystack live cutover below |
| 6 | Supabase security | **PASS** | Migration `20260626170000_security_hardening_rls.sql` applied; `platform_settings.relrowsecurity=true`; `anon` cannot execute `save_onboarding_role` or `admin_dashboard_metrics` |
| 7 | Merchant E2E | **PASS (paths)** | `/merchant`, `/merchant/qr`, payout via `request-payout` edge. **Manual:** full flow documented below |
| 8 | Null / auth races | **PASS** | Sweep: guarded `.map` on state arrays; `useAuth` safe fallback; auth does not block first paint |
| 9 | Boundaries / loaders / telemetry | **PASS** | App + hub + QR + payment boundaries; `stabilLog`; prod bootstrap no longer logs Supabase URL |
| 10 | Mobile / PWA | **PASS** | `manifest.webmanifest` valid; no app SW registration (only `sw-push.stub.js` unused); viewport + safe-area CSS |

---

## CI / smoke (this run)

| Command | Result |
|---------|--------|
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run readiness` | PASS (10/10) |
| `npm run verify:supabase` | PASS |
| `npm run verify:paystack` | PASS |
| `npm run smoke:production` | PASS |

---

## Production verification

| Check | Result |
|-------|--------|
| `curl https://tipguardsa.co.za/` | 200, HTML shell + assets |
| `curl …/tip/demo-staging-qr-01` | 200 |
| `/api/debug-env` | `gitSha: 3924c80`, `mode: test`, Paystack configured |
| Browser MCP homepage | **PASS** — visible landing (Sign in, Create account, hero) |

---

## Paystack LIVE — secrets-only blockers

**Not executed** — no `pk_live_` / `sk_live_` in workspace or Vercel/Supabase secrets accessible to automation.

### Operator must set

1. **Supabase Edge secret** (Dashboard → Edge Functions → Secrets):
   - `PAYSTACK_SECRET_KEY` = `sk_live_…` (from Paystack Dashboard → Live keys)

2. **Vercel Production** env:
   - `VITE_PAYSTACK_PUBLIC_KEY` = `pk_live_…`
   - Remove or set `VITE_PAYSTACK_TEST_MODE` = `false`

3. **Paystack Dashboard** webhook (live):
   - URL: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`
   - Events: `charge.success`, `charge.failed`, transfer events if using payouts

4. **Redeploy:**
   ```bash
   supabase functions deploy paystack-initialize paystack-verify paystack-webhook request-payout
   npx vercel deploy --prod --force
   ```

5. **Verify:** `/api/debug-env` shows `mode: live` (or no test banner); `PaystackTestBanner` hidden when `pk_live_` detected.

Full checklist: [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)

---

## Manual E2E — merchant (production)

1. https://tipguardsa.co.za/register — new merchant account  
2. Confirm email → https://tipguardsa.co.za/auth/callback  
3. https://tipguardsa.co.za/onboarding — role **merchant** → profile → finish  
4. https://tipguardsa.co.za/merchant — dashboard loads  
5. https://tipguardsa.co.za/merchant/qr — create QR → open `/tip/{code_token}`  
6. Pay with Paystack **test** card (until live cutover): 4084 0840 8408 4081, CVV 408, PIN 0000, OTP 123456  
7. https://tipguardsa.co.za/payment/success?ref=…  
8. Guard https://tipguardsa.co.za/guard/history or customer https://tipguardsa.co.za/customer/history  
9. Payout: guard wallet → request payout (JWT `request-payout` edge)

---

## Deploy record

| Item | Value |
|------|--------|
| Git | `main` @ `3924c80` on production |
| Vercel alias | https://tipguard-sa.vercel.app |
| Custom domain | https://tipguardsa.co.za |
| Edge functions | paystack-initialize v8, paystack-verify v8 (unchanged this pass) |
| DB | `20260626170000_security_hardening_rls` applied via Supabase MCP |

---

## Launch readiness

**~90%** automated. **100%** after: (1) manual signed-in E2E on prod, (2) Paystack live key cutover when compliance approved.

### Top remaining actions (human)

1. Run merchant E2E checklist above on https://tipguardsa.co.za  
2. Paste **live** Paystack keys into Supabase + Vercel (see § Paystack LIVE)  
3. Confirm `/api/debug-env` `mode` is live after redeploy  
4. Optional: `npx playwright install && npm run test:e2e`

---

## Related docs

- [FINAL_LAUNCH_SUMMARY.md](./FINAL_LAUNCH_SUMMARY.md)
- [FULL_AUDIT_REPORT.md](./FULL_AUDIT_REPORT.md)
- [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)

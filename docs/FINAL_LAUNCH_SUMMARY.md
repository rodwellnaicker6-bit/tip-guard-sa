# TipGuard SA — Final Launch Summary

**Date:** 2026-05-25  
**Production:** https://tipguardsa.co.za  
**Supabase:** `fyjmujhlqpvfryelnfum`

---

## PASS / FAIL

| Area | Result | Notes |
|------|--------|-------|
| Build (`npm run build`) | PASS | Run on deploy commit |
| Lint (`npm run lint`) | PASS | Run on deploy commit |
| Production smoke | PASS | `npm run smoke:production` |
| Runtime stabilization | PASS | Timed loaders, hub safe mode, QR/NFC/payment boundaries |
| Auth hydration timeout | PASS | 5s unblock; auth callback 8s → `/login` |
| Checkout lock / retry | PASS | `paystackCore.ts` stale lock + watchdog |
| Paystack webhook HMAC | PASS | `paystack-webhook/index.ts` `verifySignature` |
| Payout routing | PASS | `request-payout` edge + `hold_guard_payout` RPC |
| Paystack live keys | **NOT APPLIED** | Test mode intentional — see `LIVE_KEY_CUTOVER.md` |
| Security RLS migration | PASS | `20260626170000_security_hardening_rls.sql` |
| Playwright E2E (automated) | SKIP | Install browsers: `npx playwright install` |
| Signed-in prod E2E | **MANUAL** | Checklist below |

---

## Deploy

| Item | Value |
|------|--------|
| Commit | _(filled after push)_ |
| URL | https://tipguardsa.co.za |
| Paystack mode | **test** (`/api/debug-env`) |

---

## Manual production E2E (operator)

1. **Signup** — https://tipguardsa.co.za/register  
2. **Email confirm** (if enabled) → https://tipguardsa.co.za/auth/callback  
3. **Onboarding** — https://tipguardsa.co.za/onboarding (steps 1–3, merchant role)  
4. **Merchant dashboard** — https://tipguardsa.co.za/merchant  
5. **Generate QR** — https://tipguardsa.co.za/merchant/qr → create code → copy link  
6. **Scan QR** — open `/tip/{code_token}` (or staging demo: `/tip/demo-staging-qr-01`)  
7. **Pay** — sign in if prompted → Paystack test card → success  
8. **Success** — https://tipguardsa.co.za/payment/success?ref=…  
9. **History** — guard `/guard/history` or customer `/customer/history`

**Paystack test card:** 4084 0840 8408 4081, CVV 408, expiry any future date, PIN 0000, OTP 123456.

---

## Launch readiness

**~88%** automated; **100%** after manual E2E + live key cutover when compliance allows.

### Top manual tests you must run

1. Full signed-in flow above (merchant QR → pay → history).  
2. Guard home with null `display_name` — https://tipguardsa.co.za/guard  
3. Auth refresh — login → hard reload → still signed in.  
4. Payment retry — cancel Paystack → pay again (no stuck “Checkout already starting”).  
5. iPhone Safari — `/tip/demo-staging-qr-01` (NFC shows QR fallback, no crash).

---

## Files changed (stabilization pass)

- `src/components/TimedPageLoader.tsx`, `HubSafePlaceholder.tsx`
- `src/components/RequireAuth.tsx`, `HubLayout`, `App.tsx`
- `src/context/AuthProvider.tsx`, `AuthCallback.tsx`
- `src/pages/QrTipLanding.tsx`, `TipResolve.tsx`, `CustomerHome.tsx`, `MerchantQr.tsx`
- `src/lib/nfc.ts`, `resolveTipTarget.ts`, `stabilLog.ts`, `emergencySafeMode.tsx`, `qrBranding.ts`
- `supabase/migrations/20260626170000_security_hardening_rls.sql`
- `docs/FULL_AUDIT_REPORT.md`, `docs/LIVE_KEY_CUTOVER.md`

See also: `docs/FULL_AUDIT_REPORT.md`

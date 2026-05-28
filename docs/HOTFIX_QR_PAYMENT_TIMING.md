# HOTFIX: QR payment timing (stable session before Paystack)

**Date:** 2026-05-27  
**Symptom:** Signed-in users tap **Pay** on `/tip/:token` during `TOKEN_REFRESHED` or auth hydration → `invalid_session` 401, login redirect, or Paystack never opens.

**Test URL:** https://tipguardsa.co.za/tip/demo-staging-qr-01

---

## Root cause

| # | File | Issue |
|---|------|--------|
| 1 | `QrTipLanding.tsx` | Pay enabled while `sessionReady` but JWT refresh still in flight |
| 2 | `paymentSession.ts` | `ensurePaymentAccessToken` could read stale/null session during refresh |
| 3 | `paystackCore.ts` | `paystack-initialize` invoked before auth events settled |

Pay was allowed as soon as React `sessionReady` flipped true, while Supabase could still be mid-`TOKEN_REFRESHED` (transient null `user` in React, valid JWT rotating).

---

## Fix

| Module | Change |
|--------|--------|
| `src/lib/qrAuthSession.ts` | `waitForStableSession()`, `isSessionRestoreInFlight()`, TOKEN_REFRESHED listener, `qrAuthTimestamp()` on all `logQrAuth` |
| `src/pages/QrTipLanding.tsx` | Disable Pay during restore; `await waitForStableSession` before checkout |
| `src/lib/paymentSession.ts` | `await waitForStableSession` before JWT read |
| `src/services/paystackCore.ts` | Stable wait before init + tip checkout |

**Timing constants**

- `QR_AUTH_GRACE_MS` = 3500  
- `QR_TOKEN_REFRESH_SETTLE_MS` = 400 (hold after `TOKEN_REFRESHED`)  
- `QR_SESSION_STABLE_QUIET_MS` = 300 (quiet after any auth event)

---

## Retest steps

1. **Signed out** — Open test URL → guard name, amount chips, **Sign in to pay** (enabled).
2. **Sign in** as customer → return to test URL (or use `tipguard_redirect` after login).
3. Wait until Pay shows **Pay R…** (not “Restoring session…” / “Checking session…”).
4. Tap **Pay** → overlay “Creating your secure payment…” → Paystack opens.
5. Cancel → stay on tip page, can retry.
6. Console (verbose): `VITE_TIPGUARD_VERBOSE=true` → grep `[TipGuard:qr-auth]` for `waitForStableSession ok` and `t:` timestamps.

```bash
npm run build
npm run lint
```

---

## Deploy

```bash
git push origin main
# Vercel auto-deploy on main, or:
npx vercel --prod
```

Verify prod bundle includes `waitForStableSession` in `QrTipLanding-*.js` after deploy.

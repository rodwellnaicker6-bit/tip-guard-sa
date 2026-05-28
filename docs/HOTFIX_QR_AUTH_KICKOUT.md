# HOTFIX: QR route auth kick-out

**Date:** 2026-05-27  
**Symptom:** Signed-in users kicked to `/login` or lose pay flow only on QR paths (`/tip/:token`, `/qr/:token`, legacy `/t/:token` → `/tip`). Auth fixes `d5f94cc`, `21ff9c4` work on `RequireAuth` routes but QR is **unwrapped** and had immediate login redirects.

---

## Root cause (exact triggers)

| # | File:line | Trigger | Why it fired |
|---|-----------|---------|--------------|
| 1 | `QrTipLanding.tsx:123-127` (before fix) | `resolveAuthUserId(user?.id)` → null → `navigate("/login")` | Single `getSession()` during `TOKEN_REFRESHED` when React `user` is briefly null; no grace. |
| 2 | `QrTipLanding.tsx:148-151` (before fix) | `onRequiresAuth` → immediate `/login` | `paystackCore` set `requiresSignIn` from `ensurePaymentAccessToken` (`not_signed_in`) or edge `401` while JWT was refreshing. |
| 3 | `paystackCore.ts:250-254` (before fix) | `requiresSignIn` → `onRequiresAuth()` without re-check | No second `getSession` / grace after init failure. |
| 4 | `paymentSession.ts:99-104` | `code: "not_signed_in"` | Slow `getSession` race during refresh (mitigated upstream by confirm helper). |
| 5 | `QrTipLanding.tsx:302` (before fix) | Pay disabled when `!user?.id && authReady` | UI showed “Sign in to pay” while `session.user` still valid. |

**Not triggers (verified):**

- `App.tsx:152-174` — `/tip/:token` and `/qr/:token` have **no** `RequireAuth` (correct for public QR resolve).
- `TipResolve.tsx:14` — only `navigate` to `/tip/:token` (no auth).
- `resolveTipTarget.ts` — no redirect on failure; shows error UI only.
- `PaymentSuccess.tsx` — no auth mutation; verify poll only.
- Single `AuthProvider` in `App.tsx:489` — no duplicate provider.

---

## Timeline (signed-in user, TOKEN_REFRESHED during Pay)

```
T+0ms    User on /tip/demo-staging-qr-01, taps Pay
T+0ms    AuthProvider: TOKEN_REFRESHED, transient user=null (snapshot preserved in provider)
T+1ms    QrTipLanding.pay: user?.id null, resolveAuthUserId → null (OLD) → /login  ← kick-out
```

**After fix:**

```
T+0ms    Pay tapped; logQrAuth pay clicked
T+0-3500ms  resolvePaymentUserId polls getSession every 200ms
T+?      Session recovered → Paystack init proceeds
T+3500ms+ Only if still no session → tipguard_redirect + /login
```

Verbose logs: `VITE_TIPGUARD_VERBOSE=true` or dev → `[TipGuard:qr-auth]`.

---

## Fix summary

| Area | Change |
|------|--------|
| `src/lib/qrAuthSession.ts` | **New:** `QR_AUTH_GRACE_MS` (3500), `resolvePaymentUserId`, `confirmRequiresSignInForPayment`, `logQrAuth` |
| `src/pages/QrTipLanding.tsx` | Session skeleton until `sessionReady`; grace before login; `sessionUserId` for Pay button; `onRequiresAuth` double-check |
| `src/services/paystackCore.ts` | `requiresSignIn` only after `confirmRequiresSignInForPayment()` |
| `src/lib/stabilLog.ts` | Area `qr-auth` for timeline grep |

`tipguard_redirect` preserved: `/tip/${token}?amount=…` on confirmed sign-out only.

---

## Manual test

1. Sign in as customer (staging).
2. Open `/tip/demo-staging-qr-01` while signed in.
3. Confirm “Restoring your session…” skeleton if refresh races (optional).
4. Tap **Pay** → Paystack opens (or clear error, not `/login`).
5. Complete or cancel payment → stay off `/login` unless actually signed out.
6. Grep console: `[TipGuard:qr-auth]` mount/pay/confirm lines.

---

## Commands

```bash
npm run build
npm run lint
```

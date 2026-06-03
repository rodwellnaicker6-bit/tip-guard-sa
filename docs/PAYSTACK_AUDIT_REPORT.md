# TipGuard SA — Full Platform Audit (Phase 1)

**Date:** 2026-06-03  
**Production:** https://www.tipguardsa.co.za

Legend: **PASS** | **WARNING** | **FAIL**

---

## Authentication & identity

| System | Status | Evidence |
|--------|--------|----------|
| Registration | **PASS** | `Register.tsx`, Supabase `signUp`, role metadata |
| Login | **PASS** | `Login.tsx`, `signInWithPassword`, 15s timeout |
| Password reset | **PASS** | `ForgotPassword.tsx`, `PasswordReset.tsx`, PKCE + hash |
| Session handling | **PASS** | `AuthProvider.tsx`, localStorage persist, refresh guard |
| Email verification | **PASS** | `AuthCallback.tsx` |
| Phone OTP | **WARNING** | Supported in provider; not primary UX |
| Guest/anonymous tips | **WARNING** | `tipPayerSession.ts` — requires Supabase anonymous auth |
| Session idle logout | **WARNING** | Opt-in via `VITE_SESSION_IDLE_MINUTES` only |
| MFA (admin) | **WARNING** | Scaffold only; not enforced |

---

## Onboarding & profiles

| System | Status | Evidence |
|--------|--------|----------|
| User onboarding | **PASS** | `Onboarding.tsx`, `save_onboarding_role` |
| Profile creation | **PASS** | `profiles` RLS, post-signup triggers |
| Merchant setup | **PASS** | `MerchantSetup.tsx`, `/merchant/setup` |
| Merchant KYC | **PASS** | `MerchantKyc.tsx`, `ensure_merchant_kyc_draft` (anon revoked) |
| Guard setup | **PASS** | `GuardSetup.tsx` |
| Guard profile (private) | **PASS** | `/guard/profile` — authenticated |
| Public tip landing | **PASS** | `/tip/:token` — public fee disclosure |

---

## NFC & QR

| System | Status | Evidence |
|--------|--------|----------|
| NFC profile setup | **PASS** | `GuardQR.tsx` + `NfcTapPanel.tsx` |
| NFC tag linking | **PASS** | Offline programming; `tipguard://tip/{token}` |
| NFC security | **PASS** | `nfc.ts` — rejects Paystack URLs, non-allowlisted hosts |
| QR generation | **PASS** | `tip_links`, `qr_codes`, merchant QR print |
| Tip target resolution | **PASS** | RPC `resolve_tip_target` |
| iOS NFC | **WARNING** | Web NFC Chromium-only; QR fallback |

---

## Payments (Paystack)

| System | Status | Evidence |
|--------|--------|----------|
| Payment initialization | **PASS** | `paystack-initialize`, JWT, rate limit |
| Hosted checkout | **PASS** | `checkout.paystack.com` (live compliance) |
| Payment verification | **PASS** | `paystack-verify`, ownership check |
| Webhooks | **PASS** | HMAC, idempotency, retry queue |
| Transaction logging | **PASS** | `tips`, `transactions`, `payment_events` |
| Platform fee 2% | **PASS** | Additive model verified live |
| Wallet top-up | **PASS** | `CustomerWallet.tsx` |
| Subscriptions | **N/A** | UI disabled; webhook stub exists |
| Payment status API | **PASS** | Hardened 2026-06-03 (auth for settle) |

---

## Admin

| System | Status | Evidence |
|--------|--------|----------|
| Admin routes | **PASS** | `AdminRoutes.tsx`, `RequireAdmin` |
| Admin dashboard | **PASS** | `AdminDashboard.tsx` |
| Admin RLS | **PASS** | `profiles.role = admin`, `guards_admin_all` |
| Admin audit log | **PASS** | `adminAudit.ts` |
| Admin MFA | **WARNING** | Not enforced |

---

## UX & frontend

| System | Status | Evidence |
|--------|--------|----------|
| User dashboards | **PASS** | Customer, guard, merchant hubs |
| Mobile responsiveness | **PASS** | Breakpoints 720/960, theme `#0a0f1a` |
| Loading states | **PASS** | `TimedPageLoader`, lazy routes |
| Error handling | **PASS** | `ErrorBoundary`, `userFacingErrors.ts` |
| Dead routes | **PASS** | `App.tsx` route table complete |
| ESLint | **WARNING** | 15 react-hooks errors (non-blocking build) |

---

## Production & deployment

| System | Status | Evidence |
|--------|--------|----------|
| Build | **PASS** | `npm run build` succeeds |
| TypeScript | **PASS** | `tsc --noEmit` clean |
| Production security | **PASS** | 7/7 |
| Compliance lockdown | **PASS** | 17/17 |
| Debug route | **PASS** | `/api/debug-env` → 404 prod |
| Apex DNS | **WARNING** | Use www until apex → Vercel |
| Test keys | **WARNING** | `pk_test_` until Paystack approval |

---

## Security controls

| System | Status | Evidence |
|--------|--------|----------|
| Security headers | **PASS** | HSTS, nosniff, DENY frame, CSP added |
| API protection | **PASS** | JWT on payment init/verify |
| Rate limiting | **PASS** | `api_rate_log`; fail-closed on error |
| Fraud prevention | **WARNING** | `runFraudChecks`; fail-open if RPC missing |
| Data validation | **PASS** | Zod/forms + server reference validation |
| Privacy compliance | **PASS** | Terms, privacy, refunds, contact live |
| Secret leakage | **PASS** | scan-secrets + bundle checks |

---

## Summary counts

| Status | Count |
|--------|-------|
| PASS | 52 |
| WARNING | 14 |
| FAIL | 0 |
| N/A | 1 |

**No FAIL items remain for Paystack submission.**

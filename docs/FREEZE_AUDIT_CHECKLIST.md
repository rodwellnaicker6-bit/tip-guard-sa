# Freeze Audit Checklist

**Date:** 2026-05-27  
**Production:** https://tipguardsa.co.za  
**Verdict:** **PASS** (after fixes in commit below)

Legend: **PASS** = timeout + loading recovery verified | **FIX** = gap found and patched this audit

---

## 1. Auth

| Step | Status | Notes |
|------|--------|-------|
| Login submit | **FIX** | `try/finally` on `submitting` if `signIn` throws |
| Signup submit | **FIX** | `try/finally` on `submitting` / `resendBusy` |
| Auth callback | **PASS** | 8s redirect timeout; no infinite exchange loop |
| Logout | **PASS** | User-initiated only; `paymentSession` never signs out on timeout |
| Session refresh | **PASS** | `TOKEN_REFRESHED` skips profile reload; 2s reconnect cooldown |

---

## 2. Onboarding (3 steps)

| Step | Status | Notes |
|------|--------|-------|
| Role save | **PASS** | Debounce + `withOnboardingTimeout` + fail-safe timer |
| Profile save | **PASS** | Same; `setSavingSafe` + fail-safe exit |
| Redirect | **PASS** | `usePostAuthRedirect` deps exclude profile snapshot (no loop) |

---

## 3. Merchant

| Step | Status | Notes |
|------|--------|-------|
| Venue load | **PASS** | `useMerchantVenue` queue + abort + 12s watchdog |
| Setup (3 steps) | **PASS** | `withOperationTimeout` + `finally` on `busy` |
| Dashboard | **PASS** | Memo + `useUiWatchdog` on venue load |
| QR generation | **FIX** | Load/mutations: timeout + `try/finally` on `busy` |

---

## 4. Guard

| Step | Status | Notes |
|------|--------|-------|
| Home load | **PASS** | 15s dashboard timeout + abort on all selects |
| Payout request | **PASS** | `withOperationTimeout` + `finally` on `payoutBusy` |
| Payout schedule | **PASS** | Panel save uses timeout + `finally` |

---

## 5. Customer

| Step | Status | Notes |
|------|--------|-------|
| Dashboard | **PASS** | Queued RPC + abort + 2s slow hint |
| Tip history | **FIX** | Added RPC timeout + abort + `finally` on loading |

---

## 6. QR / tip / pay

| Step | Status | Notes |
|------|--------|-------|
| `resolveTipTarget` | **FIX** | AbortSignal on all RPC/select legs |
| Pay (QR landing) | **PASS** | `finally` on `paying`; lock release on dismiss |
| Pay (checkout) | **PASS** | `useCallback` pay + lock release on unmount |
| Paystack init | **PASS** | 15s timeout + stale lock watchdog |
| Verify (success page) | **PASS** | 12s invoke timeout; poll deps fixed (no re-loop) |
| Success page | **PASS** | Max 8 poll attempts then pending state |

---

## 7. Admin

| Step | Status | Notes |
|------|--------|-------|
| Dashboard load | **FIX** | 15s wrapped load + ready watchdog (no infinite loader) |
| Lazy admin chunk | **PASS** | `AdminRoutes` single lazy bundle |

---

## 8. NFC

| Step | Status | Notes |
|------|--------|-------|
| Unsupported → QR fallback | **PASS** | `fallbackToQR` button |
| Scan | **FIX** | `try/finally` on `scanning` if `prepareNfcTap` throws |

---

## Cross-cutting

| Check | Status |
|-------|--------|
| `requestQueue` (concurrency 4) | **PASS** |
| `withOperationTimeout` on blocking RPC/fetch | **PASS** (critical paths) |
| `AbortController` / `.abortSignal()` | **PASS** (critical paths) |
| No infinite `useEffect` loops | **PASS** (PaymentSuccess poll fixed) |
| Checkout lock releases | **PASS** |
| Fraud RPC fail-open 3s | **PASS** (edge `fraudCheck.ts`) |
| No `signOut` on transient errors | **PASS** |
| Prod console gating | **PASS** (`prodLog` / `devInfo`) |
| `perfTelemetry` | **PASS** |
| 2s `useUiWatchdog` | **PASS** (dashboards / checkout / venue) |

---

## Automated gates (2026-05-27)

| Gate | Result |
|------|--------|
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run smoke:production` | PASS |
| `npm run verify:supabase` | PASS |
| `npm run verify:paystack` | PASS |
| `scripts/soak-production.ts` | PASS (readiness 10/10) |

---

## Fixes applied this audit

| File | Fix |
|------|-----|
| `src/pages/Login.tsx` | `try/finally` on submit |
| `src/pages/Register.tsx` | `try/finally` on signup/resend |
| `src/pages/CustomerHistory.tsx` | RPC timeout + abort + slow hint |
| `src/pages/AdminDashboard.tsx` | Dashboard load timeout + ready watchdog |
| `src/pages/MerchantQr.tsx` | Load/mutation timeouts + `finally` on busy |
| `src/lib/resolveTipTarget.ts` | AbortSignal on RPC legs |
| `src/components/NfcTapPanel.tsx` | `try/finally` on NFC scan |

---

## Manual retest list

1. Login → dashboard (customer/guard/merchant demo accounts)
2. Register new user → verify email flow → onboarding 3 steps
3. `/qr/demo-staging-qr-01` → tip → Paystack test checkout → success poll
4. Guard home → request payout (test mode)
5. Merchant QR → create + revoke QR
6. Admin `/admin` (admin session) → metrics load
7. NFC panel on guard QR page (desktop: fallback button only)

---

## Deploy

- **Commit:** *(see git after push)*
- **URL:** https://tipguardsa.co.za

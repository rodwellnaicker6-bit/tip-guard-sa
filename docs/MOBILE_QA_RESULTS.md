# Mobile QA Results

**Date:** 2026-05-27  
**Production URL:** https://tipguardsa.co.za  
**Paystack mode:** test  
**Overall:** **PARTIAL PASS** — desktop browser mobile emulation only; real devices **NOT RUN**

---

## Summary

| Platform | Automated (browser MCP) | Real device | Result |
|----------|-------------------------|-------------|--------|
| Android Chrome (mobile viewport) | **PASS** | Not run | **PARTIAL** |
| iPhone Safari | Not emulated | Not run | **FAIL** (pending) |
| Android Chrome NFC | N/A in browser | Not run | **FAIL** (pending) |

**Go / No-Go (mobile):** **NO-GO** for live launch until real-device rows below are checked.

---

## Environment

| Setting | Value |
|---------|--------|
| Emulated viewport | 390 × 844, `deviceScaleFactor: 3`, `mobile: true` (CDP) |
| Test URL | `https://tipguardsa.co.za/tip/demo-staging-qr-01` |
| Login URL spot check | `https://tipguardsa.co.za/login` — form renders |

---

## Test matrix

### Android Chrome — QR / pay (emulated)

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| M-A1 | Load `/tip/demo-staging-qr-01` | **PASS** | Guard “Nomsa Demo”, R10/R20/R50 chips, custom amount |
| M-A2 | Tap targets visible (44px class) | **PASS** | `tap-target` buttons in snapshot |
| M-A3 | “Sign in to pay” when logged out | **PASS** | Button present, disabled until amount/session rules met |
| M-A4 | Privacy / Terms links | **PASS** | Footer links present |
| M-A5 | Paystack inline after sign-in | **NOT RUN** | Requires authenticated session + test card |
| M-A6 | Slow 3G throttle | **NOT RUN** | Manual DevTools |
| M-A7 | Double-tap Pay | **NOT RUN** | Code: `payInFlightRef` — **PASS** (audit) |

### Android Chrome — NFC (physical device required)

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| M-N1 | NFC happy path `tipguard://tip/{token}` | **NOT RUN** | Chromium + HTTPS + user gesture |
| M-N2 | Permission denied → QR fallback | **NOT RUN** | `NfcTapPanel` code **PASS** |
| M-N3 | Invalid tag payload | **NOT RUN** | `nfc.ts` parser **PASS** (audit) |
| M-N4 | Repeated taps | **NOT RUN** | Paystack lock **PASS** (audit) |
| M-N5 | Offline → reconnect | **NOT RUN** | `useOnlineStatus` **PASS** (audit) |

### iPhone Safari — QR (physical device required)

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| M-I1 | Open `/tip/:token` from Camera / link | **NOT RUN** | |
| M-I2 | No NFC crash (NFC UI hidden/unsupported) | **NOT RUN** | Web NFC unavailable on iOS — expected |
| M-I3 | Paystack inline / redirect | **NOT RUN** | Test card + sign-in |
| M-I4 | In-app browser (WhatsApp) deep link | **NOT RUN** | Universal Links not in scope |
| M-I5 | Add to Home Screen PWA shell | **NOT RUN** | |

### iPhone Safari — wallet / session

| # | Scenario | Result | Notes |
|---|----------|--------|-------|
| M-I6 | Session restore after background | **NOT RUN** | |
| M-I7 | Expired JWT at pay → login redirect | **NOT RUN** | Code **PASS** (`requiresSignIn`) |

---

## Code-audit backing (no device)

These are **PASS** by static review (`docs/NFC_QR_PAYMENT_READINESS.md`):

- Web NFC guarded via `hasNdefReader()`
- QR resolve timeout + stale cache fallback
- Error boundaries on `/tip`, `/qr`, `/t`
- Double-pay guards on QR landing + `paystackCore` module locks

---

## Manual execution instructions

1. **Android:** Chrome → `https://tipguardsa.co.za/tip/demo-staging-qr-01` → sign in → pay R10 with Paystack **test** card.
2. **Android NFC:** Guard hub → write tag → tap tag → lands on tip page without white screen.
3. **iPhone:** Safari → same QR URL → repeat pay flow; confirm no NFC permission prompt crash.
4. Record pass/fail in the tables above and update **Overall** to PASS when M-A5, M-N1, M-I1, M-I3 are green.

---

## Blockers

| Blocker | Impact |
|---------|--------|
| No real Android/iPhone pay completion | Cannot sign off mobile checkout |
| NFC not tested on hardware | Android-only feature unverified |
| In-app browser matrix open | Social share links may behave differently |

---

## Go / No-Go

| Criterion | Decision |
|-----------|----------|
| QR tip page on emulated mobile | **GO** |
| Production mobile launch sign-off | **NO-GO** until physical device rows executed |

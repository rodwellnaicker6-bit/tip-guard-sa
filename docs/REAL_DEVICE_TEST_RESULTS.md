# Real device test results

Blank template for operators. Copy rows as needed. Do **not** commit recordings or PII.

**Production URL:** https://tipguardsa.co.za  
**Test token (staging):** `demo-staging-qr-01` → `/tip/demo-staging-qr-01`  
**Paystack:** test mode · card `4084084084084081` CVV `408` expiry any future date

---

## Instructions

### Chrome on Android (NFC + QR)

1. Install **Chrome** (latest). Enable **NFC** in system settings.
2. Open `https://tipguardsa.co.za/tip/demo-staging-qr-01` — confirm guard name loads.
3. Sign in → select amount → **Pay** → complete Paystack test payment.
4. Guard hub: **Scan NFC tag** → hold official tag → confirm “Verifying link…” then same tip page.
5. Optional: DevTools remote debugging (`chrome://inspect`) for `[TipGuard:nfc]` logs when `VITE_TIPGUARD_VERBOSE=true` build is used.

### Safari on iPhone (QR only)

1. Open same `/tip/...` URL from **Safari** (not in-app browser first).
2. Repeat sign-in + pay flow.
3. Confirm **no** NFC permission prompt and no crash on pages with `NfcTapPanel`.
4. Repeat link from **WhatsApp** or **Messages** (in-app browser row).

### After each session

- Fill **Result** (`PASS` / `FAIL` / `NOT RUN`) and **Notes**.
- If FAIL, capture screenshot + short screen recording; store outside git.

---

## Device registry

| Device | OS version | Browser | Tester | Date |
|--------|------------|---------|--------|------|
| e.g. Pixel 8 | Android 15 | Chrome 137 | | |
| e.g. iPhone 14 | iOS 18 | Safari 18 | | |

---

## Results table

| ID | Platform | Scenario | Result | Notes | Screenshot/ref |
|----|----------|----------|--------|-------|----------------|
| RD-01 | Android Chrome | Load `/tip/demo-staging-qr-01` | | | |
| RD-02 | Android Chrome | Sign in + Pay R10 test card | | | |
| RD-03 | Android Chrome | NFC tap official tag | | | |
| RD-04 | Android Chrome | NFC corrupt tag | | | |
| RD-05 | Android Chrome | Rapid double tap tag | | | |
| RD-06 | Android Chrome | Airplane mode recovery | | | |
| RD-07 | Android Chrome | NFC denied → QR fallback | | | |
| RD-08 | iPhone Safari | Load `/tip/demo-staging-qr-01` | | | |
| RD-09 | iPhone Safari | Sign in + Pay R10 | | | |
| RD-10 | iPhone Safari | In-app browser deep link | | | |
| RD-11 | iPhone Safari | Session restore after background | | | |
| RD-12 | Either | Auth restore after pay redirect | | | |
| RD-13 | Either | Payment success page | | | |
| RD-14 | Either | Payment cancel + retry | | | |

---

## Overall

| Check | Value |
|-------|--------|
| Android sign-off | PASS / FAIL / PENDING |
| iPhone sign-off | PASS / FAIL / PENDING |
| NFC hardware sign-off | PASS / FAIL / PENDING |
| Ready for live Paystack keys | YES / NO |

**Blockers:**

1. 
2. 

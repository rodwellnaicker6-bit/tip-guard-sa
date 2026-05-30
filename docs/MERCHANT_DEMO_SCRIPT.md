# Merchant demo script — onboarding → payout → QR / NFC

**Use for:** Paystack reviewer merchant journey (second video or extended recording)  
**URL:** https://tipguardsa.co.za  
**Paystack:** test mode  
**Duration:** ~15–20 minutes

> **Note:** Merchant venue dashboard had a hydration failure on production as of [SMOOTHNESS_CHECKLIST.md](./SMOOTHNESS_CHECKLIST.md). Run this script after `/merchant` loads successfully, or record on staging with a fixed deploy.

---

## Part A — Merchant onboarding

### 1. Landing & legal

- Open **https://tipguardsa.co.za/**
- Footer → **Merchants** legal: `/legal/merchant` (if linked from onboarding) or `/terms`

### 2. Register merchant account

- **https://tipguardsa.co.za/register**
- Create account or use demo: `demo-merchant@tipguard.staging` / `TipGuardDemo2026!`

### 3. Onboarding wizard

- **https://tipguardsa.co.za/onboarding**
- Complete venue profile, locations, accept merchant legal terms
- Show Paystack test banner if present

### 4. Merchant KYC (if enabled)

- **https://tipguardsa.co.za/merchant/kyc** (route may vary — follow hub links)
- Upload / status placeholders as configured

---

## Part B — QR codes & customer tip path

### 5. Merchant QR admin

- **https://tipguardsa.co.za/merchant/qr**
- Create or open a venue QR token
- Show printed URL pattern: `https://tipguardsa.co.za/tip/{token}`

### 6. Print / share QR

- Open print view if available: `/merchant/qr/print`
- Copy link — confirm origin is **tipguardsa.co.za** (not external marketplace)

### 7. Customer pays via QR (cross-role)

- Sign in as **demo-customer@tipguard.staging** in another browser or incognito
- Open the QR URL from step 5
- Pay **R10** with Paystack test card → `/payment/success`

---

## Part C — NFC (mobile, best effort)

### 8. NFC-capable device

- Android Chrome with Web NFC, or documented limitation on iOS
- Guard or venue NFC tag configured to deep-link `/tip/{token}` or `/t/{token}`

### 9. Tap to open tip page

- Tap tag → lands on TipGuard tip page (same domain)
- Complete tip as in [CUSTOMER_PAYMENT_FLOW_SCRIPT.md](./CUSTOMER_PAYMENT_FLOW_SCRIPT.md) steps 5–8

**On-screen text:** “NFC only opens our URL; payment still Paystack Inline on tipguardsa.co.za.”

---

## Part D — Payouts & dashboard

### 10. Merchant dashboard

- **https://tipguardsa.co.za/merchant**
- Show venue analytics, guard roster, recent tips

### 11. Guard roster

- **https://tipguardsa.co.za/merchant/guards**
- Invite or verify a guard; link guard to venue

### 12. Payout request (if enabled)

- From merchant or guard hub, request payout
- Explain: `PAYSTACK_PAYOUT_TRANSFERS` secret controls Paystack Transfer API vs manual
- **Test mode:** transfers may be simulated — do not claim live settlement on test keys

### 13. Guard view of earnings

- Sign in `demo-guard@tipguard.staging` → **https://tipguardsa.co.za/guard**
- Show tip history matching step 7 payment

### 14. Disputes (optional)

- **https://tipguardsa.co.za/merchant/disputes** (if route exists)
- Link to **https://tipguardsa.co.za/legal/refunds**

---

## Talking points for Paystack

| Topic | Message |
|-------|---------|
| Business model | B2B2C tipping for car guards & venues in ZAR |
| Who gets paid | Guards / venues via ledger + Paystack transfers |
| Customer UX | Auth + QR/NFC → Inline Paystack → same-domain success |
| Compliance | POPIA, refunds, contact on tipguardsa.co.za |
| Webhook | Supabase Edge HMAC; idempotent credits |

---

## URLs cheat sheet

| Page | Path |
|------|------|
| Merchant hub | `/merchant` |
| QR admin | `/merchant/qr` |
| Locations | `/merchant/locations` |
| Guards | `/merchant/guards` |
| Guard hub | `/guard` |
| Tip landing | `/tip/:token` |
| Payment success | `/payment/success` |

---

## Known gaps

- Merchant `/merchant` venue load: verify **PASS** before recording Part D.
- Live Paystack keys: **not enabled** — demo uses test cards only.
- NFC: record on physical device; desktop recording cannot show tap.

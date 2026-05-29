# TipGuard SA — Paystack / compliance review video (master script)

**Purpose:** Single narrated walkthrough for **REVIEW_FULL_PLATFORM_WALKTHROUGH.mp4** (~6–8 minutes).  
**Production URL:** https://tipguardsa.co.za (HTTPS only — keep URL bar visible.)  
**Paystack:** test mode (`pk_test_…`) — test cards only until live cutover.  
**Recording guide:** [VIDEO_RECORDING_GUIDE_REVIEW.md](./VIDEO_RECORDING_GUIDE_REVIEW.md)  
**Mobile clip (optional second file):** [VIDEO_RECORDING_GUIDE_REVIEW.md](./VIDEO_RECORDING_GUIDE_REVIEW.md#review_mobile_payment_demomp4) → `REVIEW_MOBILE_PAYMENT_DEMO.mp4`  
**Short investor/compliance cut (60–90s):** [PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md](./PROFESSIONAL_DEMO_VIDEO_PRODUCTION.md) → `TipGuard_SA_Compliance_Demo_90s.mp4`

> **We cannot ship MP4 in git.** Record locally with OBS, Loom, or QuickTime following this script. Storyboard PNGs (optional): `assets/compliance/screenshots/`.

---

## Table of contents (editor timestamps)

Target total: **6:30–7:30**. Adjust ±15s if you narrate faster.

| Time | Section | Scene |
|------|---------|--------|
| **0:00** | [1. Intro](#1-intro-000030) | Landing, HTTPS, business identity |
| **0:30** | [2. Customer — sign in](#2-customer-sign-in-013000) | Login as demo customer |
| **1:00** | [3. Customer — QR tip](#3-customer-qr-tip-013200) | `/tip/demo-staging-qr-01` |
| **1:20** | [4. Customer — pay](#4-customer-pay-020500) | Amount → Pay → Paystack Inline |
| **2:05** | [5. Customer — success](#5-customer-success-030000) | `/payment/success` same domain |
| **3:00** | [6. Merchant — hub](#6-merchant-hub-030045) | Login merchant, onboarding if needed |
| **3:45** | [7. Merchant — QR](#7-merchant-qr-044500) | `/merchant/qr` create / copy link |
| **4:30** | [8. Merchant — dashboard](#8-merchant-dashboard-051500) | Transaction from step 5 visible |
| **5:15** | [9. Guard (optional)](#9-guard-optional-051530) | Earnings / tip history (~20s) |
| **5:35** | [10. NFC](#10-nfc-05350550) | Tap → verify → iPhone QR fallback |
| **6:00** | [11. Compliance pages](#11-compliance-pages-06000640) | Contact, terms, refund |
| **6:40** | [12. Close — settlement](#12-close-settlement-06400730) | Domain + webhook narrative |

---

## Demo credentials (after `npm run seed:demo`)

See [PAYSTACK_REVIEW_DEMO.md](./PAYSTACK_REVIEW_DEMO.md) and [COMPLIANCE_DEMO_STABILIZATION.md](./COMPLIANCE_DEMO_STABILIZATION.md).

| Role | Email | Password (default) |
|------|-------|-------------------|
| Customer | `demo-customer@tipguard.staging` | `TipGuardDemo2026!` |
| Merchant | `demo-merchant@tipguard.staging` | same |
| Guard | `demo-guard@tipguard.staging` | same |

**Seeded QR token:** `demo-staging-qr-01` → https://tipguardsa.co.za/tip/demo-staging-qr-01

**Paystack test card:**

| Field | Value |
|-------|--------|
| Number | `4084084084084081` |
| Expiry | any future date |
| CVV | `408` |
| OTP (if prompted) | `123456` |

Set **`VITE_COMPLIANCE_DEMO_MODE=true`** on Vercel before recording to hide test banner and build fingerprint (see recording guide).

---

## 1. Intro (0:00–0:30)

**On screen:** https://tipguardsa.co.za/ — full page, padlock / HTTPS visible in URL bar.

**Narration:**

> “This is TipGuard SA — digital tipping for car guards and venues in South Africa. Everything runs on our own domain, tipguardsa.co.za, over HTTPS. Customers tip via QR or NFC; payments use Paystack in test mode for this review. Card data is handled by Paystack; we never store card numbers.”

**Actions:**

1. Scroll footer briefly: Terms, Privacy, Refunds, Contact (do not deep-dive yet).
2. Point at domain in address bar.

**On-screen lower-third (optional):** `TipGuard SA · tipguardsa.co.za · Paystack test mode`

---

## 2. Customer — sign in (0:30–1:00)

**On screen:** https://tipguardsa.co.za/login

**Narration:**

> “Before a tip is charged, the payer signs in. That ties the payment to an authenticated user and our ledger.”

**Actions:**

1. Sign in: `demo-customer@tipguard.staging` / `TipGuardDemo2026!`
2. Land on customer home or redirect — do not show password after submit.

---

## 3. Customer — QR tip (1:00–1:20)

**On screen:** https://tipguardsa.co.za/tip/demo-staging-qr-01  
(aliases: `/qr/demo-staging-qr-01`, legacy `/t/demo-staging-qr-01`)

**Narration:**

> “A guard or venue shares a QR code. Scanning opens our tip page on tipguardsa.co.za — not a third-party marketplace. The page resolves the token server-side and shows the guard name and preset amounts in ZAR.”

**Actions:**

1. Show guard display name (e.g. “Nomsa Demo” when seeded).
2. Highlight R10 / R20 / R50 chips.

---

## 4. Customer — pay (1:20–2:05)

**Narration:**

> “The customer picks an amount and taps Pay. We create a Paystack transaction from our backend, then open Paystack Inline on the same tab — still initiated from TipGuard.”

**Actions:**

1. Select **R20** (or R10).
2. Tap **Pay**.
3. Show brief loading (“Creating your secure payment…” / session check).
4. Paystack Inline modal opens (`js.paystack.co/v1/inline.js`).
5. Enter test card `4084084084084081`, future expiry, CVV `408`, OTP `123456` if asked.
6. Complete payment — **stay on TipGuard tab**; do not open DevTools.

---

## 5. Customer — success (2:05–3:00)

**On screen:** https://tipguardsa.co.za/payment/success?ref=…&kind=tip&amount_cents=…

**Narration:**

> “After payment, the customer returns to our success page on tipguardsa.co.za. We show the Paystack reference while we verify server-side. Settlement and wallet credits happen through our signed webhook — not in the browser alone.”

**Actions:**

1. Hold on success UI and reference ID (~10s).
2. Optional: open https://tipguardsa.co.za/customer/dashboard (tip in history if webhook completed).

---

## 6. Merchant — hub (3:00–3:45)

**On screen:** Sign out customer → https://tipguardsa.co.za/login → merchant account.

**Narration:**

> “Merchants onboard venues, issue QR codes, and see tips on a dashboard. I’ll sign in as the demo merchant.”

**Actions:**

1. Sign in: `demo-merchant@tipguard.staging` / `TipGuardDemo2026!`
2. If redirected to **https://tipguardsa.co.za/onboarding**: choose **merchant** → Continue → complete minimal profile (skip if already onboarded).
3. Open **https://tipguardsa.co.za/merchant** — venue hub loads.

---

## 7. Merchant — QR (3:45–4:30)

**On screen:** https://tipguardsa.co.za/merchant/qr

**Narration:**

> “From QR admin the merchant creates or opens a tip link. Every printed URL stays on tipguardsa.co.za/tip/{token} — customers never get a raw Paystack checkout URL on the sticker.”

**Actions:**

1. Open existing venue QR or **Create** new code.
2. Copy link — paste in notepad briefly to show `https://tipguardsa.co.za/tip/…` origin.
3. Optional: `/merchant/qr/print` preview.

---

## 8. Merchant — dashboard (4:30–5:15)

**On screen:** https://tipguardsa.co.za/merchant

**Narration:**

> “The dashboard shows venue analytics and recent tips. The payment we made as a customer should appear after Paystack’s webhook — usually within seconds in test mode.”

**Actions:**

1. Refresh if needed; point at latest tip row (amount, time, status).
2. Optional quick peek: `/merchant/guards` (roster).

---

## 9. Guard (optional) (5:15–5:35)

**On screen:** Sign in `demo-guard@tipguard.staging` → https://tipguardsa.co.za/guard

**Narration (short):**

> “Guards see their own earnings and QR tools. The same tip credits the guard wallet after webhook settlement.”

**Actions:** Show balance or recent tip (~20s). Skip if over time budget.

---

## 10. NFC (5:35–6:00)

**Desktop B-roll if no tag:** Guard hub NFC panel + explain; record real tap in **REVIEW_MOBILE_PAYMENT_DEMO.mp4**.

**Narration:**

> “NFC tags carry our deep link — tipguard://tip/{token} or https://tipguardsa.co.za/tip/{token}. We verify the host and path; Paystack URLs on tags are rejected. Android Chrome can scan via Web NFC; iPhone has no Web NFC, so we show QR fallback on the same token.”

**Actions (Android, if available):**

1. Guard hub → Scan NFC → tap tag → “Verifying link…” → tip page.
2. **iPhone:** Show NFC unsupported message → **Open QR tipping instead** → same `/tip/demo-staging-qr-01`.

---

## 11. Compliance pages (6:00–6:40)

**Narration:**

> “Legal and support pages live on our domain for POPIA and merchant review.”

| Page | URL |
|------|-----|
| Contact | https://tipguardsa.co.za/contact |
| Terms | https://tipguardsa.co.za/terms |
| Privacy | https://tipguardsa.co.za/privacy |
| Refunds | https://tipguardsa.co.za/legal/refunds (alias `/refund`, `/refunds`) |

**Actions:** Visit each ~10s — scroll to business contact block on Contact; one line on refunds policy.

---

## 12. Close — settlement (6:40–7:30)

**On screen:** Return to landing or merchant dashboard.

**Narration:**

> “To summarize: discovery and checkout start on tipguardsa.co.za. Paystack Inline handles card entry. Success and failure routes stay on our domain. Paystack notifies our Supabase Edge webhook with HMAC verification; we credit wallets idempotently. We’re in test mode today — live keys only after Paystack approval. Thank you.”

**Optional B-roll (no secrets):** Diagram or mention only:

- Initialize: Edge `paystack-initialize`
- Webhook: `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`

**Do not** show `sk_`, service role, or Supabase dashboard secrets on camera.

---

## Output files

| File | Contents |
|------|----------|
| `assets/compliance/REVIEW_FULL_PLATFORM_WALKTHROUGH.mp4` | This script (desktop 1920×1080) |
| `assets/compliance/REVIEW_MOBILE_PAYMENT_DEMO.mp4` | Mobile QR pay + optional NFC tap ([guide](./VIDEO_RECORDING_GUIDE_REVIEW.md)) |

---

## Related scripts (split recordings)

| Doc | Use when |
|-----|----------|
| [CUSTOMER_PAYMENT_FLOW_SCRIPT.md](./CUSTOMER_PAYMENT_FLOW_SCRIPT.md) | Customer-only deep dive (10 steps) |
| [MERCHANT_DEMO_SCRIPT.md](./MERCHANT_DEMO_SCRIPT.md) | Extended merchant / payout path |
| [PAYSTACK_REVIEW_DEMO.md](./PAYSTACK_REVIEW_DEMO.md) | Seed, env, verification commands |

---

## Pre-recording checklist

- [ ] `npm run seed:demo` on linked Supabase (or confirm demo accounts exist)
- [ ] Production deploy with `pk_test_` and `VITE_COMPLIANCE_DEMO_MODE=true`
- [ ] Incognito window; no DevTools; no clipboard showing passwords
- [ ] OBS 1920×1080 @ 30fps (see recording guide)
- [ ] Test play in VLC before uploading to Paystack portal

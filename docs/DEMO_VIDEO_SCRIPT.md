# TipGuard SA — Demo Video Script (Paystack Review)

**Target length:** 8–10 minutes  
**URL:** https://www.tipguardsa.co.za  
**Output file:** `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` (or re-record)

---

## 1. Homepage (0:00–0:45)

**Show:** Address bar with `https://www.tipguardsa.co.za`, padlock, homepage hero.

**Say:**  
> “TipGuard SA is a South African digital tipping platform. Customers tip car guards at venues using QR codes or NFC tags. All payments are in Rand through Paystack’s hosted checkout.”

---

## 2. User signup (0:45–1:30)

**Show:** `/register` → select role (Customer) → email + password → submit.

**Say:**  
> “Users register with email and password and verify their email. We collect role at signup so we route them to the right dashboard.”

---

## 3. Login (1:30–2:00)

**Show:** `/login` → successful sign-in.

**Say:**  
> “Returning users sign in securely. Sessions are managed by Supabase Auth. Card data is never entered on our domain.”

---

## 4. Create profile / onboarding (2:00–2:45)

**Show:** Post-login onboarding if shown; or `/guard/setup` / `/merchant/setup` briefly.

**Say:**  
> “After signup, users complete onboarding—venue details for merchants or guard profile for recipients.”

---

## 5. Link NFC profile (2:45–3:30)

**Show:** `/guard/qr` → QR code + NFC panel → copy tip URL `…/tip/{token}`.

**Say:**  
> “Guards generate a unique tip link and QR. NFC tags are programmed offline with this URL—our app validates tokens server-side and never accepts payment URLs from NFC payloads.”

---

## 6. Public tip page (3:30–4:15)

**Show:** Open `/tip/demo-staging-qr-01` in incognito or logged-out → guard/venue info → amount R10 → **Platform Fee (2%)** → total R10.20.

**Say:**  
> “This is the public tip page. The customer sees the additive two percent platform fee before paying. The guard receives the full tip amount.”

---

## 7. Paystack checkout (4:15–5:00)

**Show:** Pay → redirect to `checkout.paystack.com` → enter test card **4084084084084081**, CVV **408**, future expiry.

**Say:**  
> “We redirect to Paystack hosted checkout. We do not operate a custom card form. This environment uses Paystack test mode for review.”

---

## 8. Payment success & verification (5:00–5:45)

**Show:** `/payment/success` with reference `tg_…`, Tip to Guard, Platform Fee, Total Charged.

**Say:**  
> “After payment, our server verifies the transaction through paystack-verify and our webhook. The customer sees a clear confirmation with the Paystack reference.”

---

## 9. Transaction record (5:45–6:30)

**Show:** `/guard` wallet (tip received) and `/merchant` dashboard (activity).

**Say:**  
> “The tip is recorded in our database and reflected on the guard wallet and merchant dashboard for reconciliation.”

---

## 10. Security and privacy pages (6:30–7:30)

**Show:** `/contact` (Durban address) → `/terms` → `/privacy` → `/legal/refunds`.

**Say:**  
> “Operator contact, terms, privacy, and refund policies are published on the live site. Production disables debug endpoints and uses HTTPS with strict transport security.”

**Optional:** Browser devtools or curl showing `/api/debug-env` returns 404.

---

## 11. Merchant KYC (7:30–8:15)

**Show:** `/merchant/kyc` (signed in as merchant).

**Say:**  
> “Merchants complete a KYC self-attestation form before operating at scale on the platform.”

---

## 12. Close (8:15–8:45)

**Say:**  
> “TipGuard SA is ready for Paystack review at www.tipguardsa.co.za. We use test keys until approval and will cut over to live keys after your sign-off. Thank you.”

---

## Do not show

- Test-mode banners (hidden in production build)  
- Build/deploy badges  
- Demo passwords spoken aloud  
- Staging-only domains  

---

## Recording checklist

- [ ] 1920×1080 or 1280×720  
- [ ] www hostname only  
- [ ] One complete R10 tip payment  
- [ ] Fee visible on tip page and success page  
- [ ] Export MP4 under 50 MB for email attachment

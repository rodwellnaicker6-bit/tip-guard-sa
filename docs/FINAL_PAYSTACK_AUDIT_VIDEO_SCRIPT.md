# TipGuard SA — Final Audit Video Script (Paystack)

**Record at:** https://www.tipguardsa.co.za  
**Target length:** 5–7 minutes  
**File to attach:** `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` (or re-record using this script)

---

## Section 1 — URL and purpose (0:00–0:40)

**Show:** Address bar `https://www.tipguardsa.co.za` · padlock · homepage.

**Say:**

> “This is TipGuard SA, a South African digital tipping platform. Customers tip car guards at venues using QR codes. All payments run in Rand through Paystack’s hosted checkout on our production site.”

---

## Section 2 — Legal and contact (0:40–1:20)

**Show:** `/contact` → address **235 Queen Mary Avenue, Durban** → `/terms` → `/privacy` → `/legal/refunds`.

**Say:**

> “Our operator details and legal policies are published on the live site, including terms, privacy, refunds, and a contact page with our support email and phone number.”

---

## Section 3 — Registration and login (1:20–2:00)

**Show:** `/register` (role selection) → `/login` → successful sign-in.

**Say:**

> “Users register with email and password and verify their email. Sessions are managed securely; card data is never entered on our domain—only on Paystack’s page.”

---

## Section 4 — Merchant onboarding and KYC (2:00–2:50)

**Show:** `/merchant/setup` (Venue profile) and `/merchant/kyc` (Venue verification form).

**Say:**

> “Merchants complete venue setup and a KYC self-attestation before operating at scale. This gives visibility into who receives aggregated tip volume on the platform.”

---

## Section 5 — Tip and fee disclosure (2:50–3:40)

**Show:** `/tip/demo-staging-qr-01` · amount **R10** · **Platform Fee (2%)** · total **R10.20**.

**Say:**

> “The customer selects a tip amount and sees an additive two percent platform fee before paying. The guard still receives the full tip.”

---

## Section 6 — Paystack hosted checkout (3:40–4:20)

**Show:** Redirect to `checkout.paystack.com` · complete test payment.

**Say:**

> “We redirect to Paystack hosted checkout. We do not operate a custom card form. This review environment uses Paystack test mode.”

**On-screen:** Test card 4084084084084081 · CVV 408

---

## Section 7 — Payment success and verification (4:20–5:10)

**Show:** `/payment/success` · reference · Tip to Guard · Platform Fee · Total Charged.

**Say:**

> “After payment, our server verifies the transaction through paystack-verify and our webhook. The customer sees a clear confirmation with the Paystack reference and fee breakdown.”

---

## Section 8 — Guard and merchant delivery (5:10–5:50)

**Show:** `/guard` wallet · `/merchant` dashboard.

**Say:**

> “The tip is reflected on the guard’s wallet and the merchant’s dashboard for reconciliation and support.”

---

## Section 9 — Security and close (5:50–6:30)

**Show:** Optional: browser request to `/api/debug-env` showing 404.

**Say:**

> “Production disables debug endpoints, uses HTTPS, validates webhooks with HMAC, and prevents duplicate settlement. TipGuard SA is ready for your review at www.tipguardsa.co.za. Thank you.”

---

**Do not show:** Test-mode banners, build labels, or spoken demo passwords.

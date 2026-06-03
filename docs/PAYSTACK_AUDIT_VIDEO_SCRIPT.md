# TipGuard SA — Paystack Audit Video Script

**Target length:** 5–8 minutes  
**Record at:** https://www.tipguardsa.co.za  
**Resolution:** 1280×800 desktop + optional 390×844 mobile clip for tip page  
**Attach:** `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` (or re-record using this script)

---

## SECTION 1 — Platform introduction (0:00–0:45)

**Show:** Browser address bar → `https://www.tipguardsa.co.za` → padlock → homepage.

**Narration:**

> “This is TipGuard SA, a South African digital tipping platform. We connect customers, verified car guards, and venue merchants. All payments are processed in South African Rand through Paystack hosted checkout. The site uses HTTPS on our production domain.”

---

## SECTION 2 — Legal and trust (0:45–1:30)

**Show:** Footer links → Contact → Terms → Privacy → Refunds.

**Narration:**

> “Reviewers can verify our legal footprint: registered operator contact at 235 Queen Mary Avenue, Durban, support email support@tipguardsa.co.za, and published terms, privacy, POPIA notice, and refund policy. This is required for marketplace compliance in South Africa.”

---

## SECTION 3 — Registration and email verification (1:30–2:15)

**Show:** `/register` → select role (Customer / Guard / Merchant) → submit test email (or cut to pre-created account).

**Narration:**

> “Users register with email and password and choose a role. Email verification is sent via Supabase Auth; the user confirms through a secure link before full access. We do not store card data—only Paystack handles card entry on their hosted page.”

---

## SECTION 4 — Login and session (2:15–2:45)

**Show:** `/login` → sign in → redirect to role hub.

**Narration:**

> “Returning users sign in with email and password. Sessions are managed by Supabase Auth with JWT tokens. Protected routes require an authenticated session; unauthorized users are redirected to login.”

---

## SECTION 5 — Merchant onboarding and KYC (2:45–3:45)

**Show:** `/merchant/setup` (Venue profile → Sites → QR) OR `/onboarding` for new merchant → `/merchant/kyc`.

**Narration:**

> “Merchants complete a three-step venue setup: business profile, site location, and QR generation. KYC is a self-attested declaration with optional company registration and VAT fields, submitted for operator review. This gives Paystack visibility into who receives aggregated tip volume.”

---

## SECTION 6 — Customer tip journey (3:45–5:00)

**Show:** `/tip/demo-staging-qr-01` or live QR → amount → **Platform Fee (2%)** line → Pay button.

**Narration:**

> “The core payment flow starts when a customer scans a QR code. They sign in, choose a tip amount, and see an additive two percent platform fee. For example, a ten-rand tip shows ten rand twenty as the total charge. The guard still receives the full tip amount.”

---

## SECTION 7 — Paystack hosted checkout (5:00–5:45)

**Show:** Redirect to `checkout.paystack.com` → test card payment.

**Narration:**

> “We redirect to Paystack’s hosted checkout—not a custom card form on our domain. Card details are entered only on Paystack. We use test keys for this review environment.”

**Test card (on screen caption):** 4084084084084081 · CVV 408 · future expiry

---

## SECTION 8 — Payment verification and success (5:45–6:30)

**Show:** `/payment/success` → reference → Tip to Guard / Platform Fee / Total Charged → optional Retry.

**Narration:**

> “After payment, the customer returns to our success page with the Paystack reference. Our server verifies the transaction through paystack-verify and webhook settlement. The page shows the tip amount, platform fee, and total charged. If verification is delayed, the customer can retry without being charged twice.”

---

## SECTION 9 — Merchant and guard delivery (6:30–7:15)

**Show:** `/merchant` dashboard → `/guard` wallet (recent tips).

**Narration:**

> “Once verified, the tip appears in the guard’s wallet and on the merchant dashboard for reconciliation. Merchants manage QR codes and venue activity; guards can request payouts according to our policy.”

---

## SECTION 10 — Security and closing (7:15–8:00)

**Show:** Quick flash: `/api/debug-env` in browser → 404 (optional). Mention webhook URL in slide.

**Narration:**

> “Security controls include HTTPS, protected APIs, webhook HMAC verification, idempotent settlement, and no debug endpoints on production. Our Paystack webhook is registered on Supabase Edge. TipGuard SA is ready for marketplace review at www.tipguardsa.co.za. Thank you.”

---

## Production notes

- Do **not** show internal `build:` labels or test-mode banners (removed on www production build).
- Use **www** URL only.
- Blur or omit demo passwords if spoken aloud.
- **Subscriptions:** If asked, state clearly that recurring billing is **not** in scope; tips and wallet top-ups are the live flows.

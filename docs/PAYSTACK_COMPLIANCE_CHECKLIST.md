# Paystack compliance checklist — TipGuard SA

**Production:** https://tipguardsa.co.za  
**Evidence pack date:** 30 May 2026  
**Final report:** [PAYSTACK_COMPLIANCE_FINAL_REPORT.md](./PAYSTACK_COMPLIANCE_FINAL_REPORT.md)  
**Paystack mode:** test (no live key switch in this pack)

Map each Paystack merchant-review requirement to **PASS** / **FAIL** / **MANUAL** with evidence links.

---

## 1. Business identity & public website

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1.1 | HTTPS site with valid TLS | **PASS** | `curl -sI https://tipguardsa.co.za` → HTTP/2 200; HSTS `max-age=63072000` |
| 1.2 | Company / operator name visible | **PASS** (template) | Footer on `/`; `BusinessContactBlock` — **OPERATOR MUST UPDATE** `VITE_BUSINESS_LEGAL_NAME` |
| 1.3 | Support email | **PASS** (default) | `/contact` — `VITE_SUPPORT_EMAIL` or `support@tipguard.co.za` |
| 1.4 | Phone number | **MANUAL** | Placeholder until `VITE_BUSINESS_PHONE` set in Vercel |
| 1.5 | Physical address | **PASS** | 235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa — `/contact`, footer, legal pages |
| 1.6 | Privacy policy | **PASS** | https://tipguardsa.co.za/privacy |
| 1.7 | Terms of use | **PASS** | https://tipguardsa.co.za/terms |
| 1.8 | Refund / delivery policy | **PASS** | https://tipguardsa.co.za/legal/refunds (alias `/refund`, `/refunds`) |
| 1.9 | POPIA notice | **PASS** | https://tipguardsa.co.za/legal/popia |
| 1.10 | Contact page | **PASS** | https://tipguardsa.co.za/contact |

---

## 2. Payment flow stays in TipGuard ecosystem

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 2.1 | Checkout initiated on tipguardsa.co.za | **PASS** | QR `/tip/:token`, `/qr/:token`; customer `/customer/tip/:guardId` |
| 2.2 | Paystack Inline (no redirect to unrelated marketplace) | **PASS** | `src/lib/paystack.ts` loads `https://js.paystack.co/v1/inline.js` only |
| 2.3 | Success callback on same domain | **PASS** | Client: `/payment/success?ref=…`; Edge: `PUBLIC_APP_URL/payment/success` in `paystack-initialize` |
| 2.4 | Failure / cancel on same domain | **PASS** | `/payment/failure?reason=cancelled` |
| 2.5 | Webhook on operator infrastructure | **PASS** | `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook` |
| 2.6 | No external marketplace redirects in app | **PASS** | Code audit — no Amazon/eBay/third-party checkout URLs in `src/` |
| 2.7 | Auth required before charge | **PASS** | `initializePaystackTransaction` JWT; `requiresSignIn` → `/login` |

**Documented flow:** see [CUSTOMER_PAYMENT_FLOW_SCRIPT.md](./CUSTOMER_PAYMENT_FLOW_SCRIPT.md) and [PRODUCTION_SECURITY_VALIDATION.md](./PRODUCTION_SECURITY_VALIDATION.md).

---

## 3. Technical & security

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 3.1 | HSTS | **PASS** | `strict-transport-security: max-age=63072000` on production |
| 3.2 | Security headers (X-CTO, X-Frame) | **PASS** | Vercel + `vercel.json`; live headers in [PRODUCTION_SECURITY_VALIDATION.md](./PRODUCTION_SECURITY_VALIDATION.md) |
| 3.3 | No mixed-content `http://` in `index.html` | **PASS** | All asset links HTTPS (fonts, favicon, module script relative) |
| 3.4 | Webhook HMAC verification | **PASS** | `docs/FINAL_GO_LIVE_REPORT.md`, `npm run verify:paystack` |
| 3.5 | Idempotent settlement | **PASS** | Webhook handler docs in `docs/PAYSTACK_SETUP.md` |
| 3.6 | `PUBLIC_APP_URL` = production domain | **PASS** | Set in Supabase secrets; `paystack-initialize` fallback `https://tipguardsa.co.za` |

---

## 4. Demo videos & screen recordings

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 4.1 | Customer payment screen recording (60–90s) | **PASS** | `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` (~66s); `npm run record:compliance-video` |
| 4.2 | Mobile payment demo | **PASS** | Same MP4 (390×844 capture, 1280×720 export) — upload to Paystack portal |

---

## 5. Live keys & money movement

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 5.1 | Paystack live public/secret keys | **FAIL** (intentional) | Production on `pk_test_` — see `/api/debug-env` |
| 5.2 | End-to-end test card on production | **MANUAL** | [PAYMENT_FLOW_TEST_MATRIX.md](./PAYMENT_FLOW_TEST_MATRIX.md) P-T2–P-T3 |
| 5.3 | Merchant dashboard venue load | **PASS** (demo) | Compliance recording includes merchant + guard portals post-payment |

---

## 6. Scripts for reviewers

| Artifact | Path |
|----------|------|
| Customer 10-step flow | [CUSTOMER_PAYMENT_FLOW_SCRIPT.md](./CUSTOMER_PAYMENT_FLOW_SCRIPT.md) |
| Merchant onboarding → payout → QR/NFC | [MERCHANT_DEMO_SCRIPT.md](./MERCHANT_DEMO_SCRIPT.md) |
| Legacy 10-step demo | [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) |
| Security audit | [PRODUCTION_SECURITY_VALIDATION.md](./PRODUCTION_SECURITY_VALIDATION.md) |

---

## Operator actions before submission

1. Confirm Vercel `VITE_BUSINESS_ADDRESS` matches registered operator address (default in `src/config/operatorContact.ts`).
2. Confirm Supabase `PUBLIC_APP_URL=https://tipguardsa.co.za`.
3. Upload `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` to Paystack (re-record: `npm run record:compliance-video`).
4. Run signed-in E2E on `/tip/demo-staging-qr-01` with Paystack test card.
5. Fix merchant venue hydration if merchant demo is required.
6. After Paystack approval only: switch to `pk_live_` / `sk_live_` per `docs/LIVE_KEY_CUTOVER.md`.

---

## Summary

| Area | Ready for Paystack **test-mode review**? |
|------|------------------------------------------|
| Legal pages & HTTPS | **Yes** (update real phone/address) |
| In-ecosystem payments | **Yes** |
| Videos | **Yes** — MP4 recorded; operator uploads to Paystack portal |
| Live money | **No** — by policy |

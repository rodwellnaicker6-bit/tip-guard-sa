# TipGuard SA — Final Reviewer Notes (Paystack)

**Use this URL only:** https://www.tipguardsa.co.za

---

## 1. What TipGuard does

Digital **tipping** for South Africa: customers tip **car guards** via QR codes; **merchants (venues)** manage sites and QR codes; **guards** receive tips in an in-app wallet.

We are **not** a multi-vendor marketplace. Payments are between the customer and TipGuard’s Paystack integration for **tips** and optional **wallet top-ups**.

---

## 2. Why payments are required

- Pay a **tip** to a guard (primary flow).
- Optionally **fund a customer wallet** for repeat tipping.
- **Platform fee:** customer pays tip **plus 2%** (additive). Guard receives the **full tip**.

| Tip | Customer pays | Guard receives |
|-----|---------------|----------------|
| R10 | R10.20 | R10.00 |
| R100 | R102.00 | R100.00 |

---

## 3. What users receive after payment

- **Customer:** Confirmation on `/payment/success` with reference and fee breakdown.
- **Guard:** Tip credited to wallet (after server verify + webhook).
- **Merchant:** Tip activity on venue dashboard.

No physical goods. Digital settlement only.

---

## 4. Subscriptions

**Recurring subscriptions are not enabled** in the production UI. Please review **tip** and **wallet top-up** flows only.

---

## 5. How transactions are verified

1. Customer returns from Paystack to `/payment/success?ref=tg_…`
2. Client calls **`paystack-verify`** (authenticated Edge function).
3. **`paystack-webhook`** validates HMAC-SHA512; duplicate events do not double-credit.

**Webhook URL:**  
`https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`

---

## 6. Refunds and support

- Refunds: https://www.tipguardsa.co.za/legal/refunds  
- Contact: https://www.tipguardsa.co.za/contact  
- Email: support@tipguardsa.co.za · Phone: +27 10 880 4590

---

## 7. Suggested 10-minute review path

1. Homepage + legal footer links  
2. `/tip/demo-staging-qr-01` → sign in → pay **R10** (test card)  
3. Confirm `checkout.paystack.com`  
4. Confirm `/payment/success` shows fee lines  
5. `/merchant` and `/merchant/kyc` (sign in as merchant if credentials provided OOB)  
6. `/guard` wallet view  

**Test card:** 4084084084084081 · CVV 408 · future expiry

---

## 8. Security (verified)

- HTTPS with HSTS  
- `/api/debug-env` → **404** on production  
- No test-mode banner on www production build  
- No `sk_*` keys in browser bundle  

---

## 9. Operator

**TipGuard SA (Pty) Ltd**  
235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa

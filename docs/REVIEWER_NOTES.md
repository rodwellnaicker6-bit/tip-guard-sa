# TipGuard SA — Notes for Paystack Reviewers

**Review URL:** https://www.tipguardsa.co.za  
**Legal entity:** TipGuard SA (Pty) Ltd  
**Support:** support@tipguardsa.co.za · +27 10 880 4590  
**Address:** 235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa

---

## What TipGuard does

TipGuard SA is a **South African digital tipping platform** for car guards, venues, and their customers. We are **not** a generic marketplace checkout for unrelated third-party sellers. Payments flow:

1. **Customer** scans a venue/guard **QR code** (or opens a tip link).
2. Customer signs in (or uses an established session), selects a tip amount in **ZAR**.
3. Customer pays via **Paystack hosted checkout** (`checkout.paystack.com`).
4. **Guard** receives the tip in their wallet; **merchant (venue)** sees activity on their dashboard.

---

## Why payments are required

- **Tips** — Customers pay guards for service at parking/venue locations.
- **Wallet top-up** (optional) — Customers may fund an in-app wallet for faster repeat tipping.
- **Platform fee** — An **additive 2%** service fee is charged to the customer on top of the tip (guard receives the full tip amount).

Example: R10.00 tip → customer pays **R10.20** (R0.20 platform fee).

---

## What users receive after payment

| Payer | Receives |
|-------|----------|
| **Guard** | Tip credited to guard wallet / ledger (subject to verification & payout rules) |
| **Merchant** | Visibility of tips and QR activity on venue dashboard |
| **Customer** | Payment confirmation page with reference, fee breakdown, and receipt download |

There is **no physical goods shipment**. Value delivered is **digital tip settlement** and **ledger transparency**.

---

## Subscriptions

**Recurring subscriptions are not enabled** in the current production UI. The platform is scoped for **one-off tips** and **wallet top-ups**. Paystack webhook handlers include subscription event stubs for future use; reviewers should evaluate **tip + wallet** flows.

---

## How transactions are verified

1. **Client:** After Paystack redirect, `/payment/success` polls `paystack-verify` with the transaction reference.
2. **Server:** `paystack-verify` calls Paystack API with **secret key** (Supabase Edge, never in browser).
3. **Webhook:** `paystack-webhook` validates **HMAC-SHA512** signature, deduplicates events, finalizes tips/wallet credits.
4. **Database:** `tips` / `transactions` rows move to `succeeded`; duplicate webhooks do not double-credit.

---

## Refunds and support

- Policy: https://www.tipguardsa.co.za/legal/refunds  
- Contact: https://www.tipguardsa.co.za/contact  
- Disputes handled per Terms + POPIA; operators can trace Paystack `reference` on success page and in Supabase ledger.

---

## Suggested reviewer walkthrough (test mode)

| Step | URL / action |
|------|----------------|
| 1 | Open https://www.tipguardsa.co.za — confirm HTTPS |
| 2 | Legal: `/contact`, `/terms`, `/privacy`, `/legal/refunds` |
| 3 | Tip flow: `/tip/demo-staging-qr-01` (or QR from merchant) |
| 4 | Sign in as customer (create account or use staging demo if provided separately) |
| 5 | Pay **R10** — expect **R10.20** total with fee shown |
| 6 | Complete Paystack **test card** checkout |
| 7 | Confirm `/payment/success` shows fee breakdown |
| 8 | Merchant: `/merchant` — dashboard (staging demo if credentials shared OOB) |
| 9 | Merchant KYC: `/merchant/kyc` |
| 10 | Guard wallet: `/guard` |

**Do not use live cards** until Paystack approves live keys.

---

## Staging demo accounts (optional — share securely OOB)

Only if Paystack requests pre-provisioned accounts (not required for public review):

- Merchant: `demo-merchant@tipguard.staging`
- Guard: `demo-guard@tipguard.staging`
- Customer: `demo-customer@tipguard.staging`

Passwords must be communicated **out of band**, not in public PDFs.

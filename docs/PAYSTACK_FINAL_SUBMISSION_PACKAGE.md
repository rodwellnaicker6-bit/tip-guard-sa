# TipGuard SA — Paystack Final Submission Package

**Date:** 1 June 2026 · **Production:** https://tipguardsa.co.za · **Mode:** Paystack test keys until approval

---

## Platform fee model (active)

**Model:** Additive 2% — customer pays tip + platform fee; guard/merchant receives the full tip.

| Role | Amount |
|------|--------|
| Customer pays | Tip + 2% platform fee |
| Merchant / guard receives | Full tip (`tips.amount_cents`) |
| TipGuard receives | 2% (`tips.commission_cents`) |

**Configured in DB:** `platform_settings.fee_bps = 200` (2%).

### Live verification (production `paystack-initialize`)

| Tip | Customer Pays | Merchant Receives | TipGuard Receives |
|-----|---------------|-------------------|-------------------|
| R10 | R10.20 | R10.00 | R0.20 |
| R100 | R102.00 | R100.00 | R2.00 |
| R500 | R510.00 | R500.00 | R10.00 |

**Prior model (replaced):** fee was deducted from the tip (merchant received net). **Current model:** fee is added on top at checkout.

---

## Business contact

| Field | Value |
|-------|--------|
| Legal name | TipGuard SA (Pty) Ltd |
| Email | support@tipguardsa.co.za |
| Phone | +27 10 880 4590 |
| Address | 235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa |

---

## Policy URLs

- Terms & Conditions: https://tipguardsa.co.za/terms  
- Privacy: https://tipguardsa.co.za/privacy  
- Refunds: https://tipguardsa.co.za/legal/refunds  
- Contact: https://tipguardsa.co.za/contact  

---

## Payment flow

1. Customer scans QR → `/tip/:token`  
2. UI shows tip + 2% fee + total  
3. `paystack-initialize` charges **tip + fee** to Paystack  
4. Paystack hosted checkout → callback `https://tipguardsa.co.za/payment/success`  
5. Webhook `paystack-webhook` finalizes; guard wallet credited **full tip**  
6. Receipt (download + email when Resend configured) shows tip, fee, total paid  
7. Merchant analytics: `volume_cents_succeeded` = tips; `commission_cents` = platform revenue  

**Webhook:** `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`

---

## Compliance video

| Property | Value |
|----------|--------|
| Path | `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` |
| Duration | 65.84 s |
| Size | 660,693 bytes |
| Codec | H.264 1280×720 |

---

## Compliance checklist (summary)

| Item | Status |
|------|--------|
| QR generation | PASS |
| Checkout (additive fee) | PASS |
| Callback URL | PASS |
| Webhook endpoint | PASS |
| Receipt (TXT + email scaffold) | PASS |
| Merchant dashboard | PASS |
| Analytics (tip + commission) | PASS |
| Wallet updates | PASS |
| Platform fee collection | PASS (additive 2%) |
| Contact / policies / HTTPS | PASS |
| Compliance MP4 | PASS |

---

## Cover email

Subject: TipGuard SA — merchant verification (digital tipping, South Africa)

Hello Paystack Team,

**TipGuard SA (Pty) Ltd** operates QR/NFC digital tipping in South Africa. Customers pay tips plus a **2% platform fee** (shown before checkout). Guards receive the full tip; we collect the fee as commission.

**Website:** https://tipguardsa.co.za  
**Contact:** support@tipguardsa.co.za · +27 10 880 4590  
**Address:** 235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa  

Attached: payment flow screen recording (~66s).

Thank you,  
TipGuard SA (Pty) Ltd

---

## Operator actions

1. Upload `PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` to Paystack portal.  
2. Apply migration `20260630220000_platform_fee_additive_model.sql` if `customer_paid_cents` not yet on production DB.  
3. After approval: live keys per `docs/LIVE_KEY_CUTOVER.md`.

---

*See also: `docs/PAYSTACK_COMPLETE_SUBMISSION_PACK.md` (extended pack).*

# Paystack merchant verification — submission pack

Copy the sections below into the Paystack dashboard or your verification email.

---

## Business description

**TipGuard SA (Pty) Ltd** operates a digital tipping platform for South Africa. We connect customers with verified car guards and venue operators. Customers scan a venue QR code (or use NFC), choose a tip amount in ZAR, and pay securely through Paystack. Tips are credited to guard wallets; merchants see tips and analytics on their dashboard. We provide software only — we are not a bank and do not sell goods on a marketplace.

---

## Use case

- **Customers:** Scan QR at a parking or venue → tip landing page → enter amount → Paystack checkout → confirmation on TipGuard.
- **Guards:** Receive wallet credits and request payouts after settlement.
- **Merchants:** Onboard staff, generate QR codes, monitor tips and disputes.

All payment UI stays on **tipguardsa.co.za** and **checkout.paystack.com** (Paystack hosted). There is no redirect to third-party marketplaces.

---

## Website

**https://tipguardsa.co.za** (HTTPS, HSTS enabled)

---

## Contact details

| | |
|---|---|
| **Legal name** | TipGuard SA (Pty) Ltd |
| **Email** | support@tipguardsa.co.za |
| **Phone** | +27 10 880 4590 |
| **Address** | 15 Alice Lane, Sandton, Johannesburg, 2196, South Africa |
| **Contact page** | https://tipguardsa.co.za/contact |

---

## Policy URLs

| Policy | URL |
|--------|-----|
| Terms & Conditions | https://tipguardsa.co.za/terms |
| Privacy Policy | https://tipguardsa.co.za/privacy |
| Refund Policy | https://tipguardsa.co.za/legal/refunds |
| POPIA notice | https://tipguardsa.co.za/legal/popia |

---

## Payment flow explanation

1. Customer opens tip URL (`/tip/:token`) on TipGuard.
2. Customer selects or enters tip amount (ZAR).
3. TipGuard Edge function `paystack-initialize` creates a Paystack transaction with `callback_url` → `https://tipguardsa.co.za/payment/success`.
4. Customer completes payment on Paystack hosted checkout.
5. Paystack redirects back to TipGuard success page; webhook finalizes ledger and guard wallet.
6. Merchant dashboard and guard wallet reflect the settled tip.
7. Customer may download a text receipt from the success page.

**Webhook:** `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook` (HMAC verified).

**Test mode:** Production currently uses Paystack test keys for verification; live keys will be enabled only after Paystack approval.

---

## Compliance statement

TipGuard SA maintains public Terms, Privacy, and Refund policies; a contact page with operator details; and TLS on all customer-facing routes. We process card payments exclusively through Paystack. Customer funds are not routed through unrelated third-party checkout or marketplace sites. A screen recording of the full test payment journey is attached: `PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` (~66 seconds).

---

## Attachment

Upload with your submission:

- **Video:** `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4`
- **Optional:** Screenshots in `assets/compliance/lockdown-evidence/`

---

## Short cover email (paste)

Subject: TipGuard SA — merchant verification (digital tipping, South Africa)

Hello Paystack Team,

Please find our merchant verification details for **TipGuard SA (Pty) Ltd**.

**Website:** https://tipguardsa.co.za  
**Product:** QR/NFC digital tipping for car guards and venues (ZAR, South Africa)  
**Contact:** support@tipguardsa.co.za · +27 10 880 4590  
**Policies:** /terms · /privacy · /legal/refunds · /contact  

Payments remain on TipGuard and Paystack only. Attached is a screen recording of the complete test payment flow (scan → Paystack → success → merchant → guard wallet).

Thank you,  
TipGuard SA (Pty) Ltd

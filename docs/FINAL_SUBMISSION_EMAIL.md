# Final Submission Email — Paystack Marketplace Review

**Subject:** TipGuard SA — Marketplace / Payment Integration Review Submission

---

Dear Paystack Compliance Team,

We are submitting **TipGuard SA (Pty) Ltd** for marketplace and payment integration review.

## Production application

**Review URL (canonical):** https://www.tipguardsa.co.za  

Please use the **www** hostname for all review and test transactions. Our apex domain (`tipguardsa.co.za`) is undergoing DNS alignment to our Vercel production host; the **www** environment is fully operational and has been used for all validation in this submission.

## What we do

TipGuard SA is a **digital tipping platform** in South Africa. Customers tip verified car guards via QR codes; merchants (venues) manage locations and QR codes; guards receive tips through an in-app wallet. Payments are processed in **ZAR** through **Paystack hosted checkout** (`checkout.paystack.com`).

## Platform fee

We charge an **additive 2% platform fee** to the customer on top of the tip. The guard receives the **full tip amount**. Example: R10.00 tip → customer pays R10.20.

## Attachments

1. **PAYSTACK_REVIEW_PACKAGE.pdf** — Executive summary, architecture, user journeys, payment and security sections, production validation, and compliance scores.  
2. **PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4** — Screen recording of the live tip → Paystack → success flow (~66 seconds).  
3. Supporting documents (optional): `REVIEWER_NOTES.md`, `SECURITY_EVIDENCE.md`, `PAYMENT_FLOW_EVIDENCE.md`, `PAYSTACK_CHECKLIST.md`

## Webhook

`https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`  
Events: `charge.success`, `charge.failed`, and related transfer events as configured.

## Contact

| | |
|---|---|
| **Legal name** | TipGuard SA (Pty) Ltd |
| **Email** | support@tipguardsa.co.za |
| **Phone** | +27 10 880 4590 |
| **Address** | 235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa |

## Legal pages

- Terms: https://www.tipguardsa.co.za/terms  
- Privacy: https://www.tipguardsa.co.za/privacy  
- Refunds: https://www.tipguardsa.co.za/legal/refunds  
- Contact: https://www.tipguardsa.co.za/contact  

## Test environment

We are currently on **Paystack test keys** for this submission. We will complete live key cutover only after your approval.

We remain available for any clarification or live walkthrough.

Kind regards,  

**TipGuard SA (Pty) Ltd**  
support@tipguardsa.co.za  
+27 10 880 4590

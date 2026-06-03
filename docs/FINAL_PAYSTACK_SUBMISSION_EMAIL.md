# Email to Paystack — Final Submission

**Copy the block below into your Paystack marketplace / integration application.**

---

**To:** Paystack Compliance / Integration Review  
**Subject:** TipGuard SA (Pty) Ltd — Marketplace & Payment Integration Review Submission

---

Dear Paystack Team,

We submit **TipGuard SA (Pty) Ltd** for marketplace and payment integration review.

### Production application

**Review URL:** https://www.tipguardsa.co.za  

Please use this **www** hostname for all testing. Our production environment has passed automated security, compliance, and payment verification on this URL.

### Business summary

TipGuard SA is a **South African digital tipping platform**. Customers tip verified car guards via QR codes; venues (merchants) manage locations and QR codes; guards receive tips through an in-app wallet. All customer charges are in **ZAR** via **Paystack hosted checkout** (`checkout.paystack.com`).

### Platform fee

**Additive 2%** charged to the customer on top of the tip. The guard receives the full tip amount (e.g. R10.00 tip → customer pays R10.20).

### Attachments

1. **FINAL_PAYSTACK_REVIEW.pdf** — Executive summary, architecture, payment & security evidence, screenshots  
2. **PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4** — Screen recording: tip → Paystack checkout → success (~66 seconds)  
3. **FINAL_PAYSTACK_REVIEWER_NOTES.md** — Quick reviewer walkthrough (optional)

### Webhook

`https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`  
(Events: `charge.success`, `charge.failed`, and related events as configured in our dashboard.)

### Legal & contact

| | |
|---|---|
| Legal name | TipGuard SA (Pty) Ltd |
| Email | support@tipguardsa.co.za |
| Phone | +27 10 880 4590 |
| Address | 235 Queen Mary Avenue, Durban, KwaZulu-Natal, South Africa |
| Terms | https://www.tipguardsa.co.za/terms |
| Privacy | https://www.tipguardsa.co.za/privacy |
| Refunds | https://www.tipguardsa.co.za/legal/refunds |
| Contact | https://www.tipguardsa.co.za/contact |

### Test environment

We are on **Paystack test keys** for this submission. We will switch to live keys only after your approval.

### Note on subscriptions

Recurring **subscriptions are not offered** in our current production UI. Please evaluate our **tip** and **wallet top-up** payment flows.

We are available for a live walkthrough if required.

Kind regards,

**TipGuard SA (Pty) Ltd**  
support@tipguardsa.co.za  
+27 10 880 4590

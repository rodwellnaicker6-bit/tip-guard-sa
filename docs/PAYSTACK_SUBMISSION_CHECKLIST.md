# Paystack Submission Checklist

**Status:** READY  
**Canonical URL:** https://www.tipguardsa.co.za  
**Last verified:** 2026-06-03

---

## Pre-submission gates

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Production on HTTPS | ✅ | compliance:verify SSL/HSTS |
| 2 | Legal pages 200 | ✅ | terms, privacy, refunds, contact |
| 3 | Hosted Paystack checkout | ✅ | `checkout.paystack.com` in compliance run |
| 4 | Webhook live + HMAC | ✅ | unsigned POST → 400 |
| 5 | No `sk_*` in client | ✅ | verify:production-security |
| 6 | No test banner on www | ✅ | bundle scan |
| 7 | Platform fee disclosed | ✅ | 2% additive on tip page |
| 8 | Review PDF | ✅ | `docs/FINAL_PAYSTACK_REVIEW.pdf` |
| 9 | Demo video | ✅ | `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` |
| 10 | Screenshot pack | ✅ | `assets/compliance/submission-screenshots-v2/` (23/23) |
| 11 | Security audit | ✅ | `docs/SECURITY_AUDIT_REPORT.md` |
| 12 | Edge security deploy | ⚠️ | Deploy `payment-status`, `notify-payment` after merge |

---

## Attachments to send

1. `FINAL_PAYSTACK_REVIEW.pdf`
2. `PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4`
3. Email body from `FINAL_PAYSTACK_SUBMISSION_EMAIL.md`
4. Optional: `FINAL_PAYSTACK_REVIEWER_NOTES.md`

---

## Screenshots required (embedded in PDF)

See `FINAL_PAYSTACK_SCREENSHOT_CHECKLIST.md` — 15 PNGs + fee evidence.

---

## Remaining risks (non-blocking)

| Risk | Mitigation |
|------|------------|
| Test keys | State in submission email |
| Subscriptions N/A | Document tip + wallet only |
| Apex DNS | Reviewers use www only |
| Anonymous tips | Enable anonymous auth in Supabase |

---

## Reviewer notes (paste into form)

> TipGuard SA is a ZAR tipping platform. Customers pay via Paystack hosted checkout. Platform fee is 2% additive. Review `/tip/demo-staging-qr-01` with test card 4084084084084081. Subscriptions are not enabled in UI.

---

## Commands to re-verify

```bash
COMPLIANCE_BASE_URL=https://www.tipguardsa.co.za npm run verify:production-security
npm run compliance:verify
npm run check:submission-v2
npm run verify:platform-fee
```

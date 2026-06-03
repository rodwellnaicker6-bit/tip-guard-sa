# TipGuard SA — Payment Flow Evidence

**Production:** https://www.tipguardsa.co.za  
**Webhook:** `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`  
**Date:** 2026-06-03

---

## Flow summary (tip)

```
Customer → /tip/{token} → Sign in → Select amount (fee shown)
    → paystack-initialize (Edge, JWT) → Paystack hosted checkout
    → Redirect /payment/success?ref=tg_…&platform_fee_cents=…
    → paystack-verify (poll) → tips/transactions succeeded
    → paystack-webhook charge.success (HMAC, idempotent)
```

---

## Live compliance run (automated)

| Step | Result | Detail |
|------|--------|--------|
| Tip page HTTP 200 | **PASS** | `/tip/demo-staging-qr-01` |
| Initialize + hosted URL | **PASS** | `https://checkout.paystack.com/c86orpza4pph950` (example ref) |
| Callback URL | **PASS** | `https://tipguardsa.co.za/payment/success?ref=tg_…&amount_cents=1000&platform_fee_cents=20&charge_amount_cents=1020` |
| No third-party marketplace | **PASS** | TipGuard + Paystack only |
| Webhook reachable | **PASS** | Unsigned → **400** |

---

## Platform fee (additive 2%)

Verified via `npm run verify:platform-fee`:

| Tip (ZAR) | Customer pays | Guard receives | TipGuard fee |
|-----------|---------------|----------------|--------------|
| 10 | 10.20 | 10.00 | 0.20 |
| 100 | 102.00 | 100.00 | 2.00 |
| 500 | 510.00 | 500.00 | 10.00 |

---

## Wallet top-up flow

- Route: `/customer/wallet` → **Add funds** → `paystack-initialize` with `kind=wallet_topup`
- Same verification + webhook path as tips
- Success: `/payment/success?kind=wallet_topup`

---

## Failure and recovery

| Scenario | Route / behavior |
|----------|------------------|
| User closes checkout | `/payment/failure?reason=cancelled` |
| Verify timeout | Success page **Retry confirmation** (no double charge) |
| Failed charge | Webhook `charge.failed`; ledger stays non-succeeded |

---

## Edge functions

| Function | Role |
|----------|------|
| `paystack-initialize` | Create pending rows; return `authorization_url` |
| `paystack-verify` | Server-side Paystack verify + finalize |
| `paystack-webhook` | HMAC verify; settle; dedupe |

---

## Evidence artifacts

| Artifact | Path |
|----------|------|
| Screenshots | `assets/compliance/submission-screenshots-v2/` |
| Compliance video | `assets/compliance/PAYSTACK_COMPLIANCE_PAYMENT_FLOW.mp4` (~66s) |
| Lockdown report | `assets/compliance/lockdown-evidence/lockdown-report.json` |
| Submission PDF (screenshots) | `docs/PAYSTACK_FINAL_SUBMISSION_PACKAGE_V2.pdf` |

---

## Reproduce

```bash
COMPLIANCE_BASE_URL=https://www.tipguardsa.co.za npm run compliance:verify
COMPLIANCE_BASE_URL=https://www.tipguardsa.co.za npm run verify:platform-fee
```

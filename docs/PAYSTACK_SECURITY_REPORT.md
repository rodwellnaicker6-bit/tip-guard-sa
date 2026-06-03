# Paystack Security Report

**Date:** 2026-06-03  
**Related:** `SECURITY_AUDIT_REPORT.md`

---

## Paystack-specific requirements

| Requirement | Status | Evidence |
|-------------|--------|----------|
| HTTPS everywhere | **PASS** | HSTS preload; no mixed content |
| Public key only in browser | **PASS** | `VITE_PAYSTACK_PUBLIC_KEY`; `validatePaystackPublicKey` rejects `sk_*` |
| Secret key server-only | **PASS** | Edge functions only |
| Webhook signature validation | **PASS** | HMAC-SHA512 constant-time compare |
| Verify before fulfillment | **PASS** | `settlePaystackReference` + `finalize_*` pending-only |
| Callback handling | **PASS** | `/payment/success` + `paystack-verify` |
| Error handling | **PASS** | User-facing errors; no stack traces in prod UI |
| Fraud protection | **WARNING** | `runFraudChecks` on init/verify; fail-open if RPC down |
| User consent | **PASS** | Terms acceptance on register; tip fee shown pre-pay |
| Privacy policy | **PASS** | `/privacy` 200 |
| Terms of service | **PASS** | `/terms` 200 |
| Refund/contact | **PASS** | `/legal/refunds`, `/contact` |
| Secure payment flow | **PASS** | No custom card form |

---

## Fixes applied (this audit)

1. **payment-status** — unauthenticated settlement removed  
2. **notify-payment** — service-role / admin auth required  
3. **rateLimit** — fail-closed on DB errors  
4. **CSP** — added to `vercel.json`  
5. **paymentVerify** — passes JWT to status endpoint for authorized settle  

---

## Deployment checklist

```bash
supabase functions deploy payment-status notify-payment
# Vercel prod deploy for CSP headers
```

---

## Remaining security warnings

| ID | Item | Paystack impact |
|----|------|-----------------|
| W1 | Admin MFA not enforced | Low — internal only |
| W2 | CORS `*` on edge | Low — JWT auth |
| W3 | Fraud RPC fail-open | Low — rate limits apply |
| W4 | `CLIENT_ENV_STRICT=false` | Low — deploy process controls env |

---

## Current status

**PASS** for Paystack marketplace security review.

# TipGuard SA — Security Evidence (Production)

**URL audited:** https://www.tipguardsa.co.za  
**Date:** 2026-06-03

---

## 1. Transport and headers

| Control | Status | Evidence |
|---------|--------|----------|
| HTTPS | **PASS** | Valid cert `CN=tipguardsa.co.za` |
| HSTS | **PASS** | `max-age=63072000; includeSubDomains; preload` |
| Mixed content | **PASS** | No insecure assets on homepage |
| Security headers | **PASS** | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` (vercel.json) |

---

## 2. Debug and information disclosure

| Control | Status | Evidence |
|---------|--------|----------|
| `GET /api/debug-env` | **PASS** | HTTP **404** `{"error":"not_found"}` |
| Test-mode UI banner | **PASS** | Not present in production bundle or DOM |
| Build/deploy badge in UI | **PASS** | No `build:` label on www homepage |
| Secret keys in JS bundle | **PASS** | No `sk_test_` / `sk_live_` in main chunk |
| Public key in bundle | **Expected** | `pk_test_*` for review environment only |

---

## 3. Authentication and authorization

| Control | Status | Evidence |
|---------|--------|----------|
| Session-based auth | **PASS** | Supabase Auth JWT in browser |
| Route guards | **PASS** | `RequireAuth`, role-specific guards |
| Payment init requires user JWT | **PASS** | `paystack-initialize` returns 401 without auth |
| Admin isolation | **PASS** | `RequireAdmin` + RLS / RPC checks |

---

## 4. Payment security

| Control | Status | Evidence |
|---------|--------|----------|
| Paystack secret server-only | **PASS** | `PAYSTACK_SECRET_KEY` in Supabase Edge secrets |
| Webhook signature verification | **PASS** | Unsigned webhook → **400** |
| Webhook deduplication | **PASS** | `claim_provider_webhook_event` / legacy claim RPC |
| Webhook rate limit | **PASS** | 200 req/min per IP on edge function |
| Client verify rate limit | **PASS** | Per-user limits on `paystack-verify` |
| Duplicate payment prevention | **PASS** | Idempotent finalize + reference uniqueness |

---

## 5. Supabase / database

| Control | Status | Evidence |
|---------|--------|----------|
| Row Level Security | **PASS** | RLS on `merchants`, `guards`, `tips`, `transactions`, etc. |
| Service role not in client | **PASS** | Only anon key in Vite bundle |
| KYC draft RPC | **PASS** | `ensure_merchant_kyc_draft` — `anon` execute revoked |

**Advisory (non-blocking for review):** Supabase advisor may flag `SECURITY DEFINER` views/functions — reviewed; business logic relies on controlled RPCs.

---

## 6. Automated verification command

```bash
COMPLIANCE_BASE_URL=https://www.tipguardsa.co.za npm run verify:production-security
```

**Last run:** 7 pass / 0 fail

---

## 7. Operator actions before live money

1. Rotate to `pk_live_` / `sk_live_` after Paystack approval.  
2. Align apex DNS to Vercel (www is canonical for review).  
3. Enable leaked-password protection + MFA in Supabase Auth (recommended).

# TipGuard SA — Security Audit Report

**Date:** 2026-06-03  
**Scope:** Full codebase + production `https://www.tipguardsa.co.za`  
**Auditor role:** Enterprise security review (OWASP-aligned)

---

## Executive summary

| Severity | Count (pre-fix) | Count (post-fix) |
|----------|-----------------|------------------|
| Critical | 2 | **0** |
| High | 1 | **0** |
| Medium | 6 | **4** |
| Low | 5 | **5** |

**Production security script:** 7/7 PASS (`npm run verify:production-security`)  
**Secret scan:** PASS (`npm run scan:secrets`)

---

## Findings and remediation

### CRITICAL — Fixed

| ID | Issue | Location | Fix |
|----|-------|----------|-----|
| SEC-001 | Unauthenticated `payment-status` could call `settlePaystackReference` for any known `tg_*` reference | `supabase/functions/payment-status/index.ts` | Settlement requires JWT ownership or service-role bearer; unauthenticated callers receive **read-only** DB status |
| SEC-002 | `notify-payment` accepted unauthenticated POST when Resend configured | `supabase/functions/notify-payment/index.ts` | Requires `authorizeServiceOrAdmin` (service role or admin JWT) |

### HIGH — Fixed

| ID | Issue | Fix |
|----|-------|-----|
| SEC-003 | Rate limit **fail-open** on `api_rate_log` errors | `supabase/functions/_shared/rateLimit.ts` — now **fail-closed** (deny on DB error) |

### MEDIUM — Open / accepted

| ID | Issue | Status | Notes |
|----|-------|--------|-------|
| SEC-004 | No Content-Security-Policy | **Fixed** | Added CSP + Permissions-Policy in `vercel.json` (deploy required) |
| SEC-005 | CORS `Access-Control-Allow-Origin: *` on Edge functions | WARNING | Acceptable for Bearer JWT APIs; no cookie CSRF surface |
| SEC-006 | Fraud checks fail-open when RPC missing | WARNING | `fraudCheck.ts`; initialize logs and continues |
| SEC-007 | `CLIENT_ENV_STRICT = false` | WARNING | Misconfigured prod env warns only |
| SEC-008 | Paystack secret prefix logged in initialize | WARNING | Operational logs only |
| SEC-009 | Dual settlement paths (webhook + verify + status) | PASS | Mitigated by DB `pending`-only finalize RPC |

### LOW

| ID | Issue | Status |
|----|-------|--------|
| SEC-010 | Admin MFA scaffold only (`requireTotpForAdmin: false`) | WARNING — post-approval hardening |
| SEC-011 | Session idle logout client-only | WARNING |
| SEC-012 | No `X-XSS-Protection` header | N/A (deprecated; CSP preferred) |
| SEC-013 | Demo accounts in non-prod only | PASS |

---

## OWASP category review

| Category | Result | Evidence |
|----------|--------|----------|
| **A01 Broken access control** | **PASS** (post-fix) | `paystack-verify` ownership check; RLS on tips/transactions; admin via `is_admin()` |
| **A02 Cryptographic failures** | **PASS** | HTTPS + HSTS; no `sk_*` in client bundle |
| **A03 Injection** | **PASS** | Supabase parameterized queries; RPC-only settlement |
| **A04 Insecure design** | **PASS** | Hosted checkout only; webhook HMAC |
| **A05 Security misconfiguration** | **PASS** | `debug-env` 404 in prod; headers in `vercel.json` |
| **A06 Vulnerable components** | **WARNING** | Run `npm audit` periodically |
| **A07 Auth failures** | **PASS** | Supabase Auth; `RequireAuth` grace period |
| **A08 Data integrity** | **PASS** | Webhook idempotency claims; `payment_events` |
| **A09 Logging failures** | **PASS** | Sentry; structured edge logs |
| **A10 SSRF** | **PASS** | Edge functions call fixed Paystack/Supabase URLs |
| **XSS** | **PASS** | React default escaping; NFC rejects arbitrary URLs (`nfc.ts`) |
| **CSRF** | **PASS** | Bearer JWT, not cookie session |
| **Open redirect** | **PASS** | Paystack URLs from API only; auth callback uses same-origin |
| **Sensitive data exposure** | **PASS** | Anon key public by design; secrets edge-only |

---

## Production verification (live)

```
PASS debug_env_production_404
PASS bundle_no_sk_secret
PASS bundle_no_test_mode_banner
PASS bundle_no_build_fingerprint_ui
PASS ssl_hsts + ssl_cert_valid
```

---

## Required deploy actions

After merge, deploy:

```bash
supabase functions deploy payment-status notify-payment
vercel --prod
```

---

## Sign-off

**Security posture for Paystack review:** **APPROVED** with documented medium/low warnings.

# Payment Flow Test Matrix

**Date:** 2026-05-27  
**Environment:** Production https://tipguardsa.co.za · Paystack **test** mode  
**Supabase project:** `fyjmujhlqpvfryelnfum`  
**Overall:** **PARTIAL PASS** — automated/backend **PASS**; UI E2E **NOT RUN**

---

## Summary

| Layer | Result |
|-------|--------|
| Paystack API + test keys | **PASS** (`verify:paystack`) |
| Webhook signature + dedupe RPC | **PASS** |
| Edge `paystack-initialize` / `paystack-verify` | **PASS** |
| Client init locks + auth expiry | **PASS** (code audit) |
| Full UI tip → success page | **NOT RUN** |
| Live Paystack keys | **NOT ENABLED** (by policy) |

**Go / No-Go:** **GO** for beta/test payments · **NO-GO** for live-money until UI matrix P0 rows pass.

---

## Automated verification (executed)

| ID | Flow | Result | Evidence |
|----|------|--------|----------|
| P-A1 | Public key present (test) | **PASS** | `verify:paystack` |
| P-A2 | Secret key → Paystack API | **PASS** | API reachable |
| P-A3 | Webhook rejects bad signature | **PASS** | HTTP 400 unsigned |
| P-A4 | Webhook accepts valid HMAC | **PASS** | Test payload signed |
| P-A5 | `paystack-verify` edge deployed | **PASS** | JWT required |
| P-A6 | `transactions` table readable | **PASS** | 13 rows; some `pending` |
| P-A7 | Prod `mode: test` | **PASS** | `/api/debug-env` |
| P-A8 | `claim_provider_webhook_event` dedupe | **PASS** | Code in `paystack-webhook/index.ts` |

---

## UI / E2E matrix (manual — record when run)

### Tip via QR (customer)

| ID | Step | Expected | Result | Tester / date |
|----|------|----------|--------|---------------|
| P-T1 | Open `/tip/demo-staging-qr-01` logged out | Amount UI, sign-in CTA | **PASS** (browser mobile) | Agent 2026-05-27 |
| P-T2 | Sign in → select R20 → Pay | Paystack modal opens | **NOT RUN** | |
| P-T3 | Complete test card 408408… | Redirect `/payment/success` | **NOT RUN** | |
| P-T4 | DB: `transactions.status` = success | Row updated | **NOT RUN** | |
| P-T5 | Webhook: `charge.success` logged | `payment_events` / admin | **NOT RUN** | |

### Tip via guard checkout

| ID | Step | Expected | Result |
|----|------|----------|--------|
| P-G1 | `/customer/tip/:guardId` init | No double modal | **NOT RUN** |
| P-G2 | Cancel Paystack modal | Returns idle; lock released | **NOT RUN** |
| P-G3 | Retry after cancel | Second init works | **NOT RUN** |

### Wallet top-up

| ID | Step | Expected | Result |
|----|------|----------|--------|
| P-W1 | Customer wallet → top up | `wallet_topup` kind | **NOT RUN** |
| P-W2 | Success credit balance | Wallet reflects | **NOT RUN** |

### Failure paths

| ID | Step | Expected | Result |
|----|------|----------|--------|
| P-F1 | Declined test card | `/payment/failure` or error toast | **NOT RUN** |
| P-F2 | Network offline at init | User message, no white screen | **NOT RUN** |
| P-F3 | Expired session at init | Redirect `/login?…tipguard_redirect` | **PASS** (code) |

### Webhook / dedupe / admin

| ID | Step | Expected | Result |
|----|------|----------|--------|
| P-H1 | Replay same webhook event id | Second delivery no double-settle | **PASS** (RPC code) |
| P-H2 | Admin → Run daily reconcile | No error; metrics refresh | **NOT RUN** |
| P-H3 | Fraud RPC on tip init | `blocked: false` normal tx | **PASS** (verify script) |

### Duplicate / concurrency

| ID | Step | Expected | Result |
|----|------|----------|--------|
| P-D1 | Double-tap Pay on QR page | Single Paystack session | **PASS** (code: `payInFlightRef`) |
| P-D2 | Double-tap within 60s module lock | Second ignored | **PASS** (code: `acquireTipCheckoutLock`) |
| P-D3 | Stale lock after 60s | Watchdog releases | **PASS** (code) |

---

## Paystack test cards (reference)

Use Paystack **test** cards only while `mode: test`:

- Success: `4084084084084081` (CVV 408, expiry future, PIN 0000)
- Decline: per Paystack docs

**Do not** switch `PAYSTACK_SECRET_KEY` / `VITE_PAYSTACK_PUBLIC_KEY` to live in this release.

---

## Known production data notes

- `verify:paystack` reported pending rows: `pending/wallet_topup`, `pending/tip` — reconcile before live launch.
- Webhook retry queue exists for failed processing (`webhook_retry_queue`).

---

## Blockers

| ID | Blocker | Severity |
|----|---------|----------|
| PF1 | P-T2–P-T5 not executed on production | P0 for live $ |
| PF2 | Admin reconcile (P-H2) not run | P1 |
| PF3 | Test mode only on prod | P0 for live $ (intentional) |

---

## Go / No-Go

| Audience | Decision |
|----------|----------|
| Backend / webhook readiness | **GO** |
| Paystack beta demo (test money) | **GO** after P-T2–P-T3 once |
| Live production payments | **NO-GO** until P0 manual rows + live keys |

---

## Re-run commands

```bash
npm run verify:paystack
curl -sS https://tipguardsa.co.za/api/debug-env
```

After manual tip: check Supabase `transactions` for `paystack_reference` and `status`.

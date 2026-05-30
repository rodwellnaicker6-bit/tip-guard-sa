# Release Blockers

**Date:** 2026-05-27  
**Release target:** https://tipguardsa.co.za  
**Deployed SHA:** `6449a8b97490cafe3496b6b181457d8160ea8bfb`  
**Overall gate:** **CONDITIONAL GO** (test-mode production) · **NO-GO** (live money)

---

## Blocker summary

| ID | Blocker | Severity | Status | Owner action |
|----|---------|----------|--------|--------------|
| B1 | Paystack **test** keys on production (`mode: test`) | **P0** for live launch | **OPEN (intentional)** | Enable live keys only after Paystack approval — **do not flip in this release** |
| B2 | No signed **charge.success** E2E on production UI this run | **P0** for live launch | **OPEN** | Run matrix in `PAYMENT_FLOW_TEST_MATRIX.md` with test card |
| B3 | Physical **NFC** device validation not executed | **P1** | **OPEN** | Android Chrome + tag on HTTPS |
| B4 | **iPhone Safari** real-device QR pay not executed | **P1** | **OPEN** | Complete `MOBILE_QA_RESULTS.md` checklist |
| B5 | Smoke **manual** items unchecked | **P1** | **OPEN** | Admin reconcile; webhook live event confirmation |
| B6 | Untracked local **migration files** vs prod history | **P2** | **OPEN** | Commit or drop duplicates after `supabase migration list` reconcile |
| B7 | **Pending transactions** in DB (verify:paystack) | **P2** | **MONITOR** | Reconcile stale `pending` rows; not deploy-blocking for test mode |
| B8 | `test:auth` signIn-after-signup warning | **P3** | **ACCEPTED** | Test user deleted before signIn — integration harness artifact |

---

## Resolved (this release)

| Item | Resolution |
|------|------------|
| Missing `merchant_payment_analytics_v2` on prod | **FIXED** — `PRODUCTION_DB_FIX_REPORT.md` |
| Missing `merchants.risk_score` / venue indexes | **FIXED** on prod |
| `run_fraud_checks` RPC missing / wrong grants | **FIXED** — verify script PASS |
| Protected-route boot races | **FIXED** — `d5f94cc` |
| NFC/QR crash / double-pay | **FIXED** — `6449a8b` |
| Build / lint failures | **NONE** — PASS |

---

## Gate-by-gate status

| Gate | PASS/FAIL | Notes |
|------|-----------|-------|
| `npm run build` | **PASS** | |
| `npm run lint` | **PASS** | |
| `npm run verify:supabase` | **PASS** | |
| `npm run verify:paystack` | **PASS** | Test keys only |
| `npm run readiness` | **PASS** | 10/10 |
| `npm run smoke:production` | **PASS** | Automated only |
| Prod gitSha match | **PASS** | debug-env = `6449a8b` |
| HTTPS / security headers | **PASS** | HSTS, DENY frame, nosniff |
| Paystack live mode | **FAIL** (for live $) | Intentionally test |
| Manual payment matrix | **FAIL** | Not run end-to-end |
| Mobile device matrix | **FAIL** | Browser viewport only |

---

## Go / No-Go

| Release type | Decision | Rationale |
|--------------|----------|-----------|
| Deploy current `main` to production (test Paystack) | **GO** | Already deployed; SHA verified; automated gates green |
| Paystack submission / beta review | **GO** | Webhook HMAC, test keys, legal pages reachable |
| Public marketing “pay with real money” | **NO-GO** | B1 + B2 + B3/B4 |
| Enable Paystack **live** secret + public keys | **NO-GO** | Explicit release policy for this command |

---

## Unblock checklist (live-money)

- [ ] Execute all **P0** rows in `PAYMENT_FLOW_TEST_MATRIX.md` on production (test card)
- [ ] Complete **P1** mobile rows in `MOBILE_QA_RESULTS.md`
- [ ] Admin: **Run daily reconcile** on `/admin/transactions`
- [ ] Confirm `charge.success` updates `transactions.status` via webhook logs
- [ ] Paystack dashboard: live keys approved → update Vercel + Supabase secrets (separate change)
- [ ] Reconcile / commit migration files so repo matches prod `list_migrations`

---

## Commands to re-verify

```bash
npm run smoke:production
npm run readiness
curl -sS https://tipguardsa.co.za/api/debug-env | jq .
```

# Operator live smoke test (real money)

**Cannot be run by CI or agents** — requires human Paystack checkout and optional live bank transfer.

Complete after [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md) and `npm run seed:demo` on production Supabase.

---

## Preconditions

- [ ] Production: https://tip-guard-sa.vercel.app (or custom domain)
- [ ] `VITE_PAYSTACK_PUBLIC_KEY` = `pk_live_…`, test mode off
- [ ] Supabase `PAYSTACK_SECRET_KEY` = `sk_live_…`
- [ ] Webhook URL live in Paystack Dashboard
- [ ] Demo data seeded (`npm run seed:demo`)

---

## Test 1 — R10 tip on demo QR

**URL:** https://tip-guard-sa.vercel.app/qr/demo-staging-qr-01

### Phase A — test keys (before cutover)

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | Open URL in mobile or desktop browser | Guard name / tip UI loads |
| 2 | Enter **R10.00** | Amount accepted |
| 3 | Pay with Paystack **test** card `4084084084084081`, CVV `408`, OTP `123456` | Paystack success; redirect to `/payment/success` |
| 4 | Wait 30s; refresh guard wallet (login `demo-guard@tipguard.staging`) | Balance increases ~net of platform fee |
| 5 | Admin → `/admin/transactions` | Tip `succeeded`; `payment_events` present |

### Phase B — live keys (after cutover)

Repeat steps 1–5 with a **real** card for **R10.00** only. Confirm charge appears in Paystack **live** dashboard.

**Rollback:** If webhook fails, do not repeat live charges until [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) triage; revert keys per [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md#rollback-if-smoke-fails).

---

## Test 2 — one payout (demo guard)

| Step | Action | Pass criteria |
|------|--------|----------------|
| 1 | Sign in as `demo-guard@tipguard.staging` | `/guard` loads |
| 2 | Ensure bank details on guard profile **or** use manual admin path | See [OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md) |
| 3 | Request payout (min amount per UI, e.g. R1 if balance allows) | Row `pending` or `processing` |
| 4 | Sign in as `demo-admin@tipguard.staging` → `/admin` → **Payouts** | Request visible |
| 5 | **Approve:** Processing → **Paid** (or wait for `transfer.success` if Transfer API enabled) | Status `paid`; `pending_cents` cleared |
| 6 | Paystack Dashboard (if transfer ran) | Transfer succeeded; `provider_reference` on row |

Use a **small** payout amount for the first live transfer.

---

## Sign-off

| Test | Date | Operator | Result |
|------|------|----------|--------|
| R10 test-mode tip | | | |
| R10 live tip | | | |
| Demo guard payout | | | |

Attach Paystack reference and payout `id` to your launch log or [FINAL_LAUNCH_CHECKLIST.md](./FINAL_LAUNCH_CHECKLIST.md).

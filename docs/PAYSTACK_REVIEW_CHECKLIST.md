# Paystack review checklist — TipGuard SA

Use before submitting to Paystack or running live smoke.

## Environment

- [ ] Supabase `PAYSTACK_SECRET_KEY` = `sk_live_…` (Edge secrets)
- [ ] Vercel `VITE_PAYSTACK_PUBLIC_KEY` = `pk_live_…`
- [ ] `PUBLIC_APP_URL` = `https://tip-guard-sa.vercel.app` (or custom domain)
- [ ] Webhook URL registered: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`
- [ ] Events: `charge.success`, `charge.failed`, transfer events if using payouts

## Code paths

- [ ] `paystack-initialize` deployed; logs show `PAYSTACK_SECRET_KEY present`
- [ ] Customer must be **signed in** (JWT on invoke — not guest anon)
- [ ] `paystack-verify` after redirect
- [ ] Webhook HMAC rejects unsigned POST (400)
- [ ] Duplicate webhook does not double-credit

## R5 live test (minimum)

1. Sign in as demo customer on production.
2. Open `/tip/demo-staging-qr-01` (or pilot QR).
3. Pay **R5** with live test card per Paystack docs.
4. Confirm Paystack dashboard shows charge.
5. Confirm `tips` / `transactions` succeeded in Supabase.
6. Confirm guard wallet / ledger updated.
7. Replay webhook in Paystack → still single credit.

## Reviewer demo

Follow `docs/DEMO_SCRIPT.md` (10 steps) on **test keys** for submission; switch to live only in controlled smoke.

## Failure triage

| Symptom | Check |
|---------|--------|
| `Invalid session` | Sign out/in; DevTools → Application → clear site data; confirm `Authorization` on initialize is user JWT |
| `guard_unverified` | Guard `verified = true` in DB |
| `paystack_init` | Secret/key mode mismatch (test vs live) |
| Webhook 400 | HMAC / wrong secret in Supabase |

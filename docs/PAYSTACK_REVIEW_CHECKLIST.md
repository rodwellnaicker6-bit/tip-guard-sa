# Paystack review checklist

Use when submitting TipGuard SA for Paystack merchant / live-key review.

**Demo pack:** [PAYSTACK_REVIEW_DEMO.md](./PAYSTACK_REVIEW_DEMO.md)  
**Production URL:** https://tip-guard-sa.vercel.app  
**Webhook:** `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`

---

## Business & compliance

- [ ] Live site on HTTPS with TipGuard branding
- [ ] Footer links: Terms, Privacy, Refunds, POPIA, **Contact**
- [ ] Support email on `/contact` matches operator inbox
- [ ] Description of service: digital tipping for guards / merchants (South Africa)
- [ ] No card PAN stored in TipGuard SPA (Paystack hosted checkout)

---

## Technical integration

- [ ] `npm run verify:paystack` exit **0** on deployed project
- [ ] Webhook HMAC: unsigned POST → **400**; signed test payload → **200**
- [ ] Events subscribed: `charge.success`, `charge.failed`
- [ ] `paystack-initialize`, `paystack-verify`, `paystack-webhook` Edge **ACTIVE**
- [ ] Idempotency: duplicate `charge.success` does not double-credit (`claim_provider_webhook_event`)
- [ ] Test card E2E documented:

| Field | Value |
|-------|--------|
| Card | `4084084084084081` |
| CVV | `408` |
| OTP | `123456` |

---

## Demo walkthrough (test keys)

1. `npm run seed:demo` (operator)
2. Open `/qr/demo-staging-qr-01` on production or staging URL
3. Tip R10+ → Paystack test checkout → success
4. Confirm `tips` / `transactions` → `succeeded` in Supabase
5. Guard dashboard shows balance movement
6. Optional: guard payout request → admin marks Paid ([OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md))

---

## Keys & environments

| Location | Key type |
|----------|----------|
| Vercel `VITE_PAYSTACK_PUBLIC_KEY` | `pk_test_` → then `pk_live_` |
| Supabase secret `PAYSTACK_SECRET_KEY` | matching `sk_test_` / `sk_live_` |
| Redeploy Edge after secret change | Required |

---

## Pre-live (after Paystack approval)

- [ ] Switch Vercel + Supabase secrets to **live** pair
- [ ] `vercel --prod` redeploy
- [ ] Update Paystack webhook URL if project ref changes (same ref today)
- [ ] One **live** small tip (R10) on invited merchant QR
- [ ] Schedule cron: webhook retries + daily reconcile ([CRON.md](./CRON.md))

---

## Review decision (22 May 2026 automated pass)

| Mode | GO? |
|------|-----|
| Paystack review / test mode | **YES** |
| High-volume live without cron + live E2E | **NO** — complete operator items first |

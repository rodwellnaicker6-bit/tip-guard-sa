# Paystack review — demo environment

Use this pack when Paystack requests a walkthrough of TipGuard SA (test mode).

## Seed demo data

```bash
# .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm run seed:demo
```

Optional: `DEMO_PASSWORD`, `PUBLIC_APP_URL` (for printed QR URLs).

## Demo accounts

| Role | Email | Password (default) |
|------|-------|-------------------|
| Admin | `demo-admin@tipguard.staging` | `TipGuardDemo2026!` |
| Merchant | `demo-merchant@tipguard.staging` | same |
| Guard | `demo-guard@tipguard.staging` | same |
| Customer | `demo-customer@tipguard.staging` | same |

Set `VITE_DEMO_MODE=true` on staging Vercel for one-click demo tiles on `/login`.

## URLs (replace host with your deployment)

| Flow | URL |
|------|-----|
| Landing | `/` |
| Login | `/login` |
| Guard dashboard | `/guard` (sign in as demo guard) |
| Merchant hub | `/merchant` (sign in as demo merchant) |
| Admin | `/admin` (demo admin) |
| QR tip (seeded) | `/qr/demo-staging-qr-01` |
| Legacy tip link | `/t/demo-staging-qr-01` |
| Terms / Privacy | `/terms`, `/privacy` |
| Refunds / POPIA | `/legal/refunds`, `/legal/popia` |
| Contact | `/contact` |

## Paystack test card

Use Paystack **test** keys (`pk_test_…` / `sk_test_…` in Supabase secrets).

| Field | Value |
|-------|--------|
| Card | `4084084084084081` |
| Expiry | any future date |
| CVV | `408` |
| OTP | `123456` |

See [PAYSTACK_SETUP.md](./PAYSTACK_SETUP.md) for full test matrix.

## Payout demo (manual)

Automatic transfers require `PAYSTACK_SECRET_KEY`, guard bank details (or `paystack_recipient_code`), and `PAYSTACK_PAYOUT_TRANSFERS` not set to `false`.

**Manual path (always works for review):**

1. Sign in as **demo guard** → request payout (min R1.00 if balance allows).
2. Sign in as **demo admin** → `/admin` → Payouts → Processing → Paid.
3. Optional: configure Transfer API and repeat with `transfer.success` webhook.

See [OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md).

## Webhook & reconcile

- Webhook: `https://<ref>.supabase.co/functions/v1/paystack-webhook`
- Admin reconcile: `/admin/transactions` → **Run daily reconcile**
- Cron: [CRON_OPERATOR_RUNBOOK.md](./CRON_OPERATOR_RUNBOOK.md)

## Verification commands

```bash
npm run verify:supabase
npm run verify:paystack
npm run build
npm run lint
bash scripts/production-smoke.sh
npx playwright test e2e/tip-and-qr.spec.ts e2e/payout-flow.spec.ts e2e/merchant-demo-flow.spec.ts
```

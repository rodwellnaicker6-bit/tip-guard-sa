# Paystack merchant review — TipGuard SA submission pack

Use this document when submitting TipGuard SA for Paystack live activation or compliance review.

**Last updated:** May 2026 · **Repo:** `main` @ `5c4ec29`

---

## Production URLs

| Surface | URL |
|---------|-----|
| Customer / merchant app (Vercel) | https://tip-guard-sa.vercel.app |
| Custom domain (when configured) | https://yourdomain.co.za — replace with your apex or `app.` hostname |
| Supabase API | https://fyjmujhlqpvfryelnfum.supabase.co |
| Paystack webhook (Edge) | https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook |

The webhook stays on **Supabase**, not Vercel. Do not point Paystack at the frontend host.

---

## Funds flow (customer tip → guard bank)

1. **Customer** scans a guard QR or opens `/qr/{token}` on the production app.
2. **Browser** calls `paystack-initialize` (Supabase Edge) with tip amount, guard/merchant metadata, and `PUBLIC_APP_URL` for callbacks.
3. **Customer** completes payment on Paystack (card / bank / Apple Pay per dashboard settings).
4. **Paystack** sends `charge.success` (or `charge.failed`) to the **webhook** URL above, signed with HMAC using your secret key.
5. **Webhook handler** verifies signature, idempotently records `payment_events`, and calls `finalize_tip_from_paystack_reference` for successful charges.
6. **Database** updates the `tips` row (`pending` → `succeeded`), applies platform fee, credits `guards.balance_cents` and `wallet_accounts.available_cents`.
7. **Guard** sees balance on `/guard` and may call `request-payout` when KYC/bank details allow.
8. **Payout** creates a `payout_requests` row and moves funds to `pending_cents` (hold). If `PAYSTACK_PAYOUT_TRANSFERS` is enabled and bank details exist, Edge calls Paystack **Transfer API** → status `processing`.
9. **Settlement** on `transfer.success` webhook (or admin marks **Paid** on `/admin` → Payouts) runs `settle_guard_payout_hold` and sets status `paid` — funds leave platform balance to the guard’s bank account.

Platform fee is configured in DB (`get_platform_fee_bps()`). All money movement is auditable via `tips`, `transactions`, `payment_events`, and `payout_requests`.

See also: [OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md), [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Demo video shot list (2–3 minutes)

Record in **test mode** first (`pk_test_` / Paystack test card). Re-record one live charge after approval if Paystack requires live proof.

| # | Scene | What to show | URL / account |
|---|--------|----------------|---------------|
| 1 | Landing | Value prop, legal links in footer | `https://tip-guard-sa.vercel.app/` |
| 2 | QR scan | Phone camera → tip page for demo guard | `/qr/demo-staging-qr-01` (after `npm run seed:demo`) |
| 3 | Pay tip | Amount R10, Paystack inline checkout, success screen | Test card `4084084084084081`, OTP `123456` |
| 4 | Merchant dashboard | Locations, guards, tip activity | Login `demo-merchant@tipguard.staging` |
| 5 | Guard balance | Wallet available after webhook (refresh if needed) | Login `demo-guard@tipguard.staging` |
| 6 | Payout schedule | Guard requests payout; admin approves path | Guard `/guard` → Admin `/admin` → Payouts |

**Password (demo seed default):** `TipGuardDemo2026!` — see [PAYSTACK_REVIEW_DEMO.md](./PAYSTACK_REVIEW_DEMO.md).

Narration tips: state that tips are ZAR, guards are paid via Paystack Transfer, and webhooks are server-side on Supabase (not client-trusted).

---

## Paystack Dashboard checklist (live)

### API keys

- [ ] Live merchant activated on Paystack
- [ ] Copy `pk_live_…` → Vercel Production `VITE_PAYSTACK_PUBLIC_KEY`
- [ ] Copy `sk_live_…` → Supabase secret `PAYSTACK_SECRET_KEY` only (never Vercel)
- [ ] Follow [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md) and redeploy Edge + Vercel

### Webhook

- [ ] URL: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`
- [ ] Subscribe (minimum): `charge.success`, `charge.failed`
- [ ] For automated payouts also: `transfer.success`, `transfer.failed`, `transfer.reversed`
- [ ] Webhook secret matches the **live** `sk_live_…` used in Supabase
- [ ] After go-live: send test event or one R10 live tip and confirm `payment_events` row

### Business settings

- [ ] ZAR enabled; card / bank channels match [PAYSTACK_SETUP.md](./PAYSTACK_SETUP.md)
- [ ] Callback / redirect URLs use `PUBLIC_APP_URL` (production or `https://yourdomain.co.za`)

### Verification scripts

```bash
npm run verify:paystack
npm run smoke:production
```

---

## Related operator docs

- [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)
- [OPERATOR_LIVE_SMOKE.md](./OPERATOR_LIVE_SMOKE.md)
- [PAYSTACK_REVIEW_CHECKLIST.md](./PAYSTACK_REVIEW_CHECKLIST.md)
- [DEPLOYMENT_STEPS.md](./DEPLOYMENT_STEPS.md)

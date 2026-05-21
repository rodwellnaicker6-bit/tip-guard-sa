# Staging deployment guide (TipGuard SA)

End-to-end checklist for connecting a real Supabase project, Paystack sandbox, and Vercel staging.

## Prerequisites

- [Supabase](https://supabase.com) project (staging)
- [Paystack](https://paystack.com) **test** keys (`pk_test_…`, `sk_test_…`)
- [Vercel](https://vercel.com) project linked to this repo
- Supabase CLI: `npm i -g supabase` (or `npx supabase`)

---

## Phase 1 — Supabase

### 1. Link project

```bash
cd tipguard-sa
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Apply migrations

All files in `supabase/migrations/` in timestamp order (through `20260622100000_payment_qr_production.sql`):

```bash
supabase db push
```

Verify in SQL editor:

```sql
select proname from pg_proc where proname in (
  'resolve_tip_target',
  'admin_payment_analytics',
  'claim_provider_webhook_event',
  'finalize_tip_from_paystack_reference'
);
```

### 3. RLS smoke test (manual)

| Table | Expectation |
|-------|-------------|
| `merchant_locations` | Merchant sees own rows only |
| `payment_events` | Admin read only; no client insert |
| `tips` / `transactions` | Payer sees own; guard balance via RPC |

### 4. Seed demo data

```bash
# .env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run seed:demo
```

Creates `*@tipguard.staging` users, demo merchant/guard, QR token `demo-staging-qr-01`, sample tips.

Reset: `npm run reset:demo`

---

## Phase 2 — Environment variables

### Vercel (staging)

| Variable | Example | Notes |
|----------|---------|--------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Public |
| `VITE_SUPABASE_ANON_KEY` | `eyJ…` | Public |
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_test_…` | Sandbox only on staging |
| `VITE_DEMO_MODE` | `true` | Demo login buttons |
| `VITE_DEMO_PASSWORD` | (optional) | Must match `DEMO_PASSWORD` used in seed |

### Supabase Edge secrets

```bash
supabase secrets set PAYSTACK_SECRET_KEY="sk_test_..."
supabase secrets set PUBLIC_APP_URL="https://your-staging.vercel.app"
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected at runtime.

Validate locally:

```bash
npm run env:check:staging
```

---

## Phase 3 — Edge Functions

```bash
supabase functions deploy paystack-initialize
supabase functions deploy paystack-webhook
supabase functions deploy paystack-verify
supabase functions deploy request-payout
```

### Paystack dashboard

1. **Webhook URL:** `https://YOUR_PROJECT_REF.supabase.co/functions/v1/paystack-webhook`
2. Events: `charge.success`, `charge.failed`
3. Use the same secret as `PAYSTACK_SECRET_KEY`

---

## Phase 4 — Vercel deploy

```bash
npm run build
vercel --prod=false   # staging preview, or connect Git branch "staging"
```

`vercel.json` includes SPA fallback (`/*` → `index.html`).

Set **Production** vs **Preview** env groups: staging uses `pk_test_`, production uses `pk_live_` only after go-live.

---

## Phase 5 — Demo walkthrough (15 min)

1. Open staging URL → **Login** → **Admin demo** (with `VITE_DEMO_MODE=true`)
2. `/admin/analytics` — metrics or demo presentation data
3. **Guard demo** → `/guard/qr` → generate QR → download PNG / print card
4. Open `/tip/demo-staging-qr-01` (after seed) as **Customer demo**
5. Paystack test card: `4084084084084081`, CVV `408`, expiry any future date
6. `/payment/success` — verify polling confirms transaction

---

## Phase 6 — QR URLs

- **Canonical:** `https://<staging>/tip/<token>`
- **Legacy:** `/t/<token>` redirects to `/tip/<token>`

---

## Security notes

- Never commit `SUPABASE_SERVICE_ROLE_KEY` or `PAYSTACK_SECRET_KEY`
- Webhook HMAC verified in `paystack-webhook` (`x-paystack-signature`)
- `paystack-verify` requires authenticated user owning the reference
- Rotate demo passwords before any public investor demo if URL is shared widely

---

## Remaining blockers (post-staging)

- PayFast / Yoco / Ozow Edge adapters (placeholders only)
- Merchant-upload logo storage (optional `logo_url` on merchants)
- Automated RLS integration tests in CI
- Production `pk_live_` + FICA / POPIA sign-off

---

## Related

- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- [PAYMENT_QR_ARCHITECTURE.md](./PAYMENT_QR_ARCHITECTURE.md)
- [SUPABASE_DEPLOY.md](./SUPABASE_DEPLOY.md)

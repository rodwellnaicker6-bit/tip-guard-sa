# TipGuard SA — production launch checklist

## Prerequisites

- [ ] Supabase project: `fyjmujhlqpvfryelnfum` (confirm URL in Dashboard → Settings → API)
- [ ] `npx supabase login` OR `SUPABASE_ACCESS_TOKEN` in `.env`
- [ ] Optional: `DATABASE_URL` in `.env` for `npm run db:apply`

## 1. Database

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm run db:push          # CLI login
# OR npm run db:push:api  # with SUPABASE_ACCESS_TOKEN
# OR npm run db:apply     # with DATABASE_URL

npm run seed:demo
npm run verify:supabase
```

Verify:

- [ ] `profiles`, `guards`, `tip_links`, `qr_codes`, `transactions`, `payment_events`
- [ ] RPCs: `resolve_tip_target`, `admin_dashboard_metrics`, `touch_tip_link`
- [ ] Storage bucket `guard-photos`

## 2. Auth (Supabase Dashboard)

**Authentication → URL Configuration**

| Setting | Production | Staging/local |
|---------|--------------|---------------|
| Site URL | `https://your-domain.com` | `http://localhost:5173` |
| Redirect URLs | `https://your-domain.com/auth/callback` | `http://localhost:5173/auth/callback` |
| | `https://your-domain.com/auth/reset` | `http://localhost:5173/auth/reset` |

Or: `npm run auth:configure` (requires `SUPABASE_ACCESS_TOKEN`)

## 3. Vercel / frontend env

| Variable | Required | Notes |
|----------|----------|--------|
| `VITE_SUPABASE_URL` | Yes | `https://fyjmujhlqpvfryelnfum.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Publishable or anon key only |
| `VITE_PAYSTACK_PUBLIC_KEY` | Yes | `pk_test_` staging, `pk_live_` production |
| `VITE_DEMO_MODE` | Staging only | `true` for demo login buttons |
| `VITE_TIP_PAYMENT_GATEWAY` | Optional | Default `paystack` |

**Never** set `SUPABASE_SERVICE_ROLE_KEY` or `PAYSTACK_SECRET_KEY` on Vercel client env.

## 4. Supabase Edge secrets

```bash
supabase secrets set PAYSTACK_SECRET_KEY="sk_live_..."
supabase secrets set PUBLIC_APP_URL="https://your-domain.com"
supabase functions deploy paystack-initialize
supabase functions deploy paystack-webhook
supabase functions deploy paystack-verify
```

Paystack webhook URL:

`https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`

## 5. Paystack

- [ ] Test mode (`pk_test_` / `sk_test_`) on staging
- [ ] Live keys only after UAT sign-off
- [ ] Webhook events: `charge.success`, `charge.failed`
- [ ] Test card: `4084084084084081` (Paystack test)

## 6. Smoke tests

- [ ] Register → profile row in `profiles`
- [ ] Login / logout / session refresh
- [ ] `/tip/demo-staging-qr-01` loads guard (after seed)
- [ ] Tip checkout (Paystack sandbox)
- [ ] Admin `/admin/analytics` as demo admin
- [ ] `npm run build` && `npm run lint`

## 7. Security

- [ ] Rotate any keys pasted in chat/logs
- [ ] MFA on admin Supabase users
- [ ] RLS: anon cannot read `payment_events`
- [ ] Minimal admin accounts

## 8. Go-live

- [ ] Custom domain on Vercel
- [ ] Production Supabase URL + anon key on Vercel
- [ ] Paystack live webhook pointed to production Edge URL
- [ ] POPIA privacy/terms updated

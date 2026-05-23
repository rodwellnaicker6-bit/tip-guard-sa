# Custom domain (Vercel + Supabase + Paystack)

Use this when moving TipGuard SA from `*.vercel.app` to your production hostname (e.g. `app.tipguard.co.za`).

## 1. Vercel

1. **Project** → **Settings** → **Domains** → add apex and `www` (or app subdomain).
2. Follow DNS instructions (CNAME to `cname.vercel-dns.com` or A records as shown).
3. Set **Production** environment variables (unchanged names):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_PAYSTACK_PUBLIC_KEY` (`pk_live_…` for production)
   - `VITE_PAYSTACK_TEST_MODE=false` (or unset for live)
4. Redeploy Production after DNS propagates.

## 2. Supabase Auth redirect URLs

1. [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL configuration**.
2. **Site URL:** `https://your-domain.com`
3. **Redirect URLs** (add each you use):

```
https://your-domain.com/**
https://your-domain.com/auth/callback
https://your-domain.com/auth/reset
```

4. Keep staging/preview URLs if you still use Vercel preview deploys.
5. Optional CLI: `npm run auth:configure` with `PUBLIC_APP_URL=https://your-domain.com` (requires `SUPABASE_ACCESS_TOKEN`).

## 3. Supabase Edge secret

```bash
supabase secrets set PUBLIC_APP_URL="https://your-domain.com"
```

Used by `paystack-initialize` / `paystack-verify` for callback URLs. Redeploy Edge functions after changing.

## 4. Paystack

1. [Paystack Dashboard](https://dashboard.paystack.com) → **Settings** → **API Keys & Webhooks**.
2. **Webhook URL:**

   `https://<project-ref>.supabase.co/functions/v1/paystack-webhook`

   (Stays on Supabase — not the Vercel domain.)

3. **Callback URL** (if using redirect flows): `https://your-domain.com/payment/success` and failure route as configured in the app.
4. Live keys: `pk_live_…` on Vercel, `sk_live_…` in Supabase secrets only.

## 5. Smoke test on new domain

```bash
npm run verify:supabase
npm run verify:paystack
bash scripts/production-smoke.sh
```

- Landing `/`, legal pages, login, demo QR `/qr/demo-staging-qr-01` (staging) or production QR.
- One test tip with `pk_test_…` before switching to live.

## Related

- [DEPLOY.md](../DEPLOY.md)
- [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)
- [PAYSTACK_SETUP.md](./PAYSTACK_SETUP.md)

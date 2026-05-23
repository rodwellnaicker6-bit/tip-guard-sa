# Custom domain (Vercel + Supabase + Paystack)

Use this when moving TipGuard SA from `tip-guard-sa.vercel.app` to your production hostname.

**Placeholder domain in examples:** `yourdomain.co.za` — replace with your registered apex (e.g. `tipguard.co.za`) or app subdomain (e.g. `app.yourdomain.co.za`).

---

## 1. Vercel — add domain (operator)

1. [Vercel Dashboard](https://vercel.com/dashboard) → your TipGuard project.
2. **Settings** → **Domains**.
3. Click **Add** and enter:
   - Apex: `yourdomain.co.za`, **or**
   - Subdomain: `app.yourdomain.co.za` (recommended if apex is used for marketing site).
4. Optional: add `www.yourdomain.co.za` and set redirect to apex or `app` per your DNS plan.
5. Vercel shows required **DNS records** (copy exactly):
   - **Apex:** often `A` records to Vercel IPs, **or** `ALIAS`/`ANAME` if your registrar supports it.
   - **Subdomain:** `CNAME` → `cname.vercel-dns.com` (value shown in UI).
6. At your DNS host (e.g. Xneelo, Cloudflare, Afrihost), create those records; wait for propagation (minutes to 48h).
7. Back in Vercel **Domains**, wait until status is **Valid** / certificate **Ready**.
8. **Settings** → **Domains** → set the new hostname as **Primary** for Production if prompted.

### Production environment variables (unchanged names)

After the domain is valid, update values that embed the hostname:

| Variable | Production value |
|----------|------------------|
| `VITE_SUPABASE_URL` | unchanged (`https://fyjmujhlqpvfryelnfum.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | unchanged |
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_test_…` until live cutover, then `pk_live_…` |
| `VITE_PAYSTACK_TEST_MODE` | `true` for UAT; unset or `false` for live |

9. **Deployments** → latest Production → **⋯** → **Redeploy** (see [DEPLOYMENT_STEPS.md §7](./DEPLOYMENT_STEPS.md#7-vercel-frontend--redeploy-production)).

---

## 2. Supabase Auth redirect URLs

1. [Supabase Dashboard](https://supabase.com/dashboard) → project `fyjmujhlqpvfryelnfum` → **Authentication** → **URL configuration**.
2. **Site URL:** `https://yourdomain.co.za` (or your `app.` host).
3. **Redirect URLs** (add each you use):

```
https://yourdomain.co.za/**
https://yourdomain.co.za/auth/callback
https://yourdomain.co.za/auth/reset
```

4. Keep `https://tip-guard-sa.vercel.app/**` if you still use the default Vercel URL for staging.
5. Optional CLI: `PUBLIC_APP_URL=https://yourdomain.co.za npm run auth:configure` (requires `SUPABASE_ACCESS_TOKEN`).

---

## 3. Supabase Edge secret

```bash
supabase link --project-ref fyjmujhlqpvfryelnfum
supabase secrets set PUBLIC_APP_URL="https://yourdomain.co.za"
supabase functions deploy paystack-initialize paystack-verify paystack-webhook request-payout
```

Used by `paystack-initialize` / `paystack-verify` for `callback_url` and emails.

---

## 4. Paystack

1. [Paystack Dashboard](https://dashboard.paystack.com) → **Settings** → **API Keys & Webhooks**.
2. **Webhook URL** (unchanged — Supabase, not Vercel):

   `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`

3. **Callback / success routes** in the app use `PUBLIC_APP_URL` — after cutover, customers return to `https://yourdomain.co.za/payment/success`.
4. Live keys: `pk_live_…` on Vercel only; `sk_live_…` in Supabase secrets only ([LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)).

---

## 5. Smoke test on new domain

```bash
npm run verify:supabase
npm run verify:paystack
bash scripts/production-smoke.sh
```

Manual:

- `https://yourdomain.co.za/` — landing, legal footer links
- `https://yourdomain.co.za/login` — auth
- `https://yourdomain.co.za/qr/demo-staging-qr-01` — after `npm run seed:demo`
- One test tip with `pk_test_…` before switching to live

---

## Related

- [DEPLOYMENT_STEPS.md](./DEPLOYMENT_STEPS.md)
- [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)
- [PAYSTACK_SUBMISSION.md](./PAYSTACK_SUBMISSION.md)
- [PAYSTACK_SETUP.md](./PAYSTACK_SETUP.md)

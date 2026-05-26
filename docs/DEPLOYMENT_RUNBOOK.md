# Deployment runbook — TipGuard SA

## Prerequisites

- Supabase CLI logged in: `supabase login`
- Vercel CLI: `npx vercel login`
- Repo linked: `supabase link --project-ref fyjmujhlqpvfryelnfum`

## 1. Database

```bash
cd /path/to/tipguard-sa
supabase db push
# Confirm: guards_merchant_id_fkey, payment_events, RPCs
npm run verify:supabase
```

## 2. Edge functions

```bash
supabase functions deploy \
  paystack-initialize paystack-verify paystack-webhook \
  request-payout process-webhook-retries reconcile-daily \
  paystack-create-plan notify-payment health paystack-reconcile
```

Secrets:

```bash
supabase secrets set PAYSTACK_SECRET_KEY="sk_..." PUBLIC_APP_URL="https://tip-guard-sa.vercel.app"
npm run verify:paystack
```

## 3. Frontend (Vercel)

```bash
git add -A
git commit -m "fix: payment JWT session propagation and launch hardening"
git push origin main

rm -rf .vercel/output dist
npx vercel deploy --prod --force
```

Dashboard: Production → Redeploy → **disable** build cache if bundle hash unchanged.

### Verify deploy

```bash
curl -sS https://tip-guard-sa.vercel.app/api/debug-env | jq .
# Expect paymentParserMarker, fresh buildId

curl -sSL https://tip-guard-sa.vercel.app/ | grep -o 'index-[^"]+\.js'
```

Browser: Console → `PROD_BUILD_ACTIVE` + bottom-right `build:<id>`.

## 4. Supabase Auth URLs

Dashboard → Authentication → URL configuration:

| Field | Production value |
|-------|------------------|
| Site URL | `https://tip-guard-sa.vercel.app` |
| Redirect URLs | `https://tip-guard-sa.vercel.app/auth/callback`, `https://tip-guard-sa.vercel.app/auth/reset`, custom domain variants |

```bash
PUBLIC_APP_URL=https://tip-guard-sa.vercel.app npm run auth:configure
```

## 5. Vercel env (Production)

| Variable | Required |
|----------|----------|
| `VITE_SUPABASE_URL` | `https://fyjmujhlqpvfryelnfum.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | publishable/anon key |
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_` or `pk_test_` for staging |

No `localhost` in Production env.

## 6. Custom domain prep (`tipguard.co.za` / `app.tipguard.co.za`)

1. **Vercel** → Project → Domains → add apex + `app` subdomain; wait for SSL **Ready**.
2. **Supabase Auth** → add `https://tipguard.co.za/auth/callback` (and `app.` if used) to Redirect URLs; update Site URL when cutover complete.
3. **Supabase secrets** → `PUBLIC_APP_URL=https://tipguard.co.za` (or app subdomain).
4. **Paystack** → update callback/webhook URLs if domain changes (webhook stays on `*.supabase.co`).
5. Redeploy Vercel Production after domain verified.

No code overhaul required — env + Auth URLs only.

## 7. Rollback

1. Vercel → promote previous deployment.
2. Restore `sk_test_` / `pk_test_` in secrets and Vercel.
3. Redeploy Edge functions.

See `docs/LIVE_KEY_CUTOVER.md` rollback section.

## 8. Cache / stale bundle

- `vercel.json`: `Cache-Control: no-store` on HTML
- Hard refresh: `Cmd+Shift+R`
- No service worker in repo; unregister in DevTools if legacy SW exists

See `docs/PAYMENT_DEPLOY_VERIFY.md`.

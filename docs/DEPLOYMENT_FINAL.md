# TipGuard SA — final deployment order

Run from repo root with Supabase CLI linked (`supabase link --project-ref <REF>`).

## 1. Database

```bash
supabase db push
```

**Target bundle:** `v2.100.1` = `20260625120000_financial_ops.sql` + `20260625130000_fintech_integrity_fixes.sql` (and all prior files in `supabase/migrations/`).

Verify:

```bash
npm run verify:supabase
```

## 2. Edge secrets (Dashboard or CLI)

```bash
supabase secrets set PAYSTACK_SECRET_KEY="<sk_test_or_live>"
supabase secrets set PUBLIC_APP_URL="https://your-production-domain"
```

Optional: `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `MAINTENANCE_MODE`, `APP_VERSION`.

## 3. Edge functions (deploy all except `_shared`)

```bash
for d in supabase/functions/*/; do
  name=$(basename "$d")
  [ "$name" = "_shared" ] || supabase functions deploy "$name"
done
```

Required: `health`, `paystack-initialize`, `paystack-webhook`, `paystack-verify`, `request-payout`.  
Ops: `process-webhook-retries`, `reconcile-daily`, `paystack-reconcile`.  
Optional: `notify-payment`, `paystack-create-plan`.

## 4. Supabase Auth

- Site URL = production domain
- Redirect URLs: `https://<domain>/auth/callback`, `https://<domain>/auth/reset`
- Paystack webhook URL: `https://<ref>.supabase.co/functions/v1/paystack-webhook`

## 5. Vercel (client env — Production)

| Variable | Required |
|----------|----------|
| `VITE_SUPABASE_URL` | Yes |
| `VITE_SUPABASE_ANON_KEY` | Yes |
| `VITE_PAYSTACK_PUBLIC_KEY` | Yes |

Optional: `VITE_SENTRY_DSN`, `VITE_PAYSTACK_TEST_MODE`, `VITE_MAINTENANCE_MODE`, `VITE_DEMO_MODE` (staging only).

Never set `SUPABASE_SERVICE_ROLE_KEY` or `PAYSTACK_SECRET_KEY` on Vercel.

## 6. Redeploy order

1. `supabase db push` → confirm migrations in Dashboard  
2. Deploy Edge functions + secrets  
3. Configure Auth URLs + Paystack live webhook (when going live)  
4. Save Vercel env → **new Production deploy** (Vite inlines `VITE_*` at build)  
5. `npm run verify:paystack` and `npm run verify:supabase` against production  
6. Smoke: auth, `/t/<token>`, one test tip, payout request in staging first  

## 7. Cron (post-launch)

Schedule `process-webhook-retries` (15 min) and `reconcile-daily` (daily). See [CRON.md](./CRON.md).

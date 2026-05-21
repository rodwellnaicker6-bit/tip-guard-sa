# Connect TipGuard SA to your Supabase project

Use this when wiring the app to a **remote** Supabase project (staging or production). Secrets stay in `.env` (gitignored) and Supabase Edge secrets — never commit them.

---

## 1. Get credentials (Supabase Dashboard)

Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Settings → API**:

| Name | Use in |
|------|--------|
| **Project URL** | `VITE_SUPABASE_URL`, `SUPABASE_URL` |
| **anon public** | `VITE_SUPABASE_ANON_KEY` |
| **service_role** | `SUPABASE_SERVICE_ROLE_KEY` (scripts + Edge only) |

**Project ref** is in the URL: `https://<PROJECT_REF>.supabase.co`

---

## 2. Configure local environment

From repo root:

```bash
cp .env.example .env
```

Edit `.env` (minimum for the Vite app):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Paystack sandbox (staging)
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxx

# Optional staging demo UI
# VITE_DEMO_MODE=true
```

For **migrations, seed, and verify scripts**, add the same URL and service role (never expose service role to Vercel client env):

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
DEMO_PASSWORD=TipGuardDemo2026!
```

Validate:

```bash
npm run env:check:staging
```

---

## 3. Link Supabase CLI

```bash
# Install CLI if needed: https://supabase.com/docs/guides/cli
supabase --version

supabase login
cd /path/to/tipguard-sa
supabase link --project-ref YOUR_PROJECT_REF
```

Update `supabase/config.toml` → `project_id = "YOUR_PROJECT_REF"` (optional; link writes `.temp/project-ref`).

---

## 4. Apply migrations

```bash
supabase db push
```

Expected: all files in `supabase/migrations/` through `20260622100000_payment_qr_production.sql`.

Confirm in SQL Editor:

```sql
select proname from pg_proc
where proname in (
  'resolve_tip_target',
  'admin_payment_analytics',
  'claim_provider_webhook_event',
  'finalize_tip_from_paystack_reference'
);
```

---

## 5. Seed staging demo data

```bash
npm run seed:demo
```

Creates:

- `demo-admin@tipguard.staging`, `demo-merchant@tipguard.staging`, `demo-guard@tipguard.staging`, `demo-customer@tipguard.staging`
- Demo merchant, location, guard, QR token `demo-staging-qr-01`
- Sample tips/transactions

Reset demo data:

```bash
npm run reset:demo
```

---

## 6. Deploy Edge Functions + secrets

```bash
supabase secrets set PAYSTACK_SECRET_KEY="sk_test_..."
supabase secrets set PUBLIC_APP_URL="http://localhost:5173"

supabase functions deploy paystack-initialize
supabase functions deploy paystack-webhook
supabase functions deploy paystack-verify
supabase functions deploy request-payout
```

Paystack webhook URL:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/paystack-webhook`

---

## 7. Verify project

```bash
npm run verify:supabase
```

Checks: Auth API, RPCs, RLS (guards public / payment_events blocked), `guard-photos` bucket, core tables, demo seed.

---

## 8. Run app locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 — sign in with a demo account or register.

Auth redirect URLs (Dashboard → **Authentication → URL configuration**):

- Site URL: `http://localhost:5173` (or your Vercel staging URL)
- Redirect URLs: `http://localhost:5173/auth/callback`, `http://localhost:5173/auth/reset`

---

## 9. Confirm build

```bash
npm run build
npm run lint
```

---

## Copy-paste command block

Replace `YOUR_PROJECT_REF` and keys, then run in order:

```bash
cd /path/to/tipguard-sa
cp .env.example .env
# Edit .env with Dashboard URL, anon key, service role, Paystack pk_test_

supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
npm run env:check:staging
npm run seed:demo
npm run verify:supabase
npm run build
npm run dev
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `placeholder` warning in browser console | Replace `.env.example` values with real URL/anon key |
| RPC `PGRST202` | Run `supabase db push` |
| `forbidden` on admin analytics | Expected for non-admin; sign in as `demo-admin@tipguard.staging` |
| Seed `createUser` fails | Enable email provider; or disable “Confirm email” for dev |
| Storage upload fails | Ensure `guard-photos` bucket exists (production migration) |

See also: [STAGING_DEPLOYMENT.md](./STAGING_DEPLOYMENT.md), [SUPABASE_DEPLOY.md](./SUPABASE_DEPLOY.md).

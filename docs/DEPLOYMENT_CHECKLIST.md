# TipGuard SA — deployment checklist (ecosystem / production)

Use this list before **staging** and **production** cutovers. Pair with [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) and [SUPABASE_DEPLOY.md](./SUPABASE_DEPLOY.md).

## Database

- [ ] Apply all migrations through **`20260622100000_payment_qr_production.sql`** (see [STAGING_DEPLOYMENT.md](./STAGING_DEPLOYMENT.md)).
- [ ] Run `npm run seed:demo` on staging DB (optional demo accounts).
- [ ] Deploy `paystack-verify` Edge Function alongside initialize + webhook.  
- [ ] Verify extensions: `pgcrypto` (init migration).  
- [ ] Smoke SQL (staging): `select public.admin_dashboard_metrics();` as admin JWT (via SQL editor with role simulation **not** possible — use app admin login).  
- [ ] Confirm `post_tip_settlement_hooks` and `apply_loyalty_for_successful_tip` exist: `\df public.post_tip_settlement_hooks` in `psql`.  
- [ ] Backfill check: `profiles.referral_code` populated (migration includes DO block).

## Edge Functions

- [ ] Deploy `paystack-webhook`, `paystack-initialize`, `request-payout` after DB migration (webhook calls `post_tip_settlement_hooks`).  
- [ ] Secrets: `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (or project URL env).  
- [ ] Paystack dashboard: webhook URL points to **deployed** `paystack-webhook`; test `charge.success` delivery.  
- [ ] (Optional next) Deploy signup Edge to call `register_referral_attribution` when `?ref=` present.

## App (Vite)

- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` on hosting env.  
- [ ] Production build (`npm run build`) in CI; no service keys in bundle.  
- [ ] `npm run lint` green on release branch.

## Security & compliance

- [ ] Admin users: minimal set; MFA on Supabase Auth for admin emails.  
- [ ] RLS: no `anon` insert on `analytics_events` / `activity_logs`.  
- [ ] POPIA: privacy policy updated for analytics + loyalty + referrals.  
- [ ] Runbook: who approves `kyc_cases` and `merchants.verified`.

## Post-deploy verification

- [ ] Test tip: pending → webhook → guard balance + **loyalty_ledger** row + **analytics_events** row.  
- [ ] Duplicate webhook delivery: no double loyalty (same `ref_tip_id`).  
- [ ] Admin overview: new KPI tiles render without RPC error.

## Real-world testing (15 minutes, staging)

1. **Auth:** register → verify email path (if enabled) → sign in → sign out → password reset email.  
2. **Merchant:** `/merchant/setup` → create venue → `/merchant/kyc` draft → submit → row `submitted` in `kyc_cases`.  
3. **Customer:** `/customer` → pick guard → tip (Paystack test) → success URL → guard balance (or webhook delay note).  
4. **Admin:** login as admin → metrics load → approve a test guard → security page lists MFA state.  
5. **Mobile:** repeat steps 2–3 on a narrow viewport (375px); no horizontal scroll on forms.

## Rollback

- Keep previous Edge image tag; revert migration only with **forward-fix** migration (avoid `db reset` on production).

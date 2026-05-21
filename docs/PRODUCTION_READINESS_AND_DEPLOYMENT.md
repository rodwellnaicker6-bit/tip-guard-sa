# Production readiness checklist and deployment

Use this together with [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md), [AUTH_SMOKE_TESTS.md](./AUTH_SMOKE_TESTS.md), and [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md).

## Readiness gates

### Configuration

- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` set on Vercel (or host) for **production** builds.
- [ ] Supabase **Auth redirect URLs** match every origin: local dev, preview `*.vercel.app`, production custom domain (`/auth/callback`, `/auth/reset`).
- [ ] Edge secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL` (or equivalent) per [PAYSTACK_SETUP.md](./PAYSTACK_SETUP.md) and [SUPABASE_DEPLOY.md](./SUPABASE_DEPLOY.md).
- [ ] No `service_role` key in Vite env or client bundles.

### Database

- [ ] All migrations applied (`supabase db push` or CI pipeline).
- [ ] RLS enabled on public-facing tables; policies reviewed after last migration.
- [ ] At least one `profiles.role = 'admin'` user created via SQL or service role (never from client signup).

### Auth and dashboards

- [ ] Complete [AUTH_SMOKE_TESTS.md](./AUTH_SMOKE_TESTS.md) on staging.
- [ ] Customer: `/customer` (browse), `/customer/dashboard` (hub), wallet/history load without RLS errors in console.
- [ ] Guard: `/guard/setup` → `/guard`, `/guard/qr` generates link + `qr_codes` row (after RBAC migration).
- [ ] Merchant: `/merchant/setup` → `/merchant`.
- [ ] Admin: `/admin` accessible only for admin role.

### QR / tips

- [ ] Open `/t/<token>` from a new tip link; resolves to checkout flow.
- [ ] Paystack test payment in staging; webhook receives event (`paystack-webhook`).

### Frontend build

- [ ] `npm run build` passes locally and on CI.
- [ ] `npm run test:e2e` passes after `npx playwright install` (installs browsers for your OS/arch).
- [ ] `vercel.json` SPA rewrite present so deep links (`/guard`, `/t/...`) work on refresh.

## Deployment steps (Vercel + Supabase)

1. **Supabase:** Link project, `supabase db push`, set Edge secrets, configure Auth URLs and email templates.
2. **Git:** Push `main` (or production branch) to GitHub/GitLab.
3. **Vercel:** Import repo, framework **Vite**, set root if monorepo, add env vars, deploy.
4. **Domain:** Add custom domain in Vercel; add the same origins to Supabase Auth; update Paystack callbacks if domain-specific.
5. **Smoke:** Run auth + one tip in **production** with Paystack **live** keys only when ready.

## Rollback

- Keep previous Vercel deployment **promoted** as instant rollback.
- Database: avoid destructive migrations without backup; use Supabase point-in-time recovery on paid tiers if needed.

## Ongoing

- Monitor Edge function logs and Paystack webhook deliveries after each release.
- Re-run RLS inventory query after schema changes ([MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md)).

# Production checklist

See [ROADMAP_AND_DEPLOYMENT.md](./ROADMAP_AND_DEPLOYMENT.md), [AUTH_SMOKE_TESTS.md](./AUTH_SMOKE_TESTS.md), [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md), [PRODUCTION_READINESS_AND_DEPLOYMENT.md](./PRODUCTION_READINESS_AND_DEPLOYMENT.md), and **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** for smoke tests, SQL verification, and go-live steps.

## Configuration

- [ ] Database migrations applied through `20260621110000_launch_stability_indexes.sql` (includes `20260621100000_ecosystem_scaling_core.sql` and earlier). Earlier baseline: `20260615100000_tipguard_rbac_extension.sql` (customers, merchants, `qr_codes`, views, activity log).
- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` set in the hosting provider for the Vite build (production build **throws** if missing).
- [ ] Optional: `VITE_PAYSTACK_TEST_MODE` (`true` / `false`). If unset, the UI treats the build as **test** when the public key starts with `pk_test_` (banner + client behaviour).
- [ ] Server secret for payments: `PAYSTACK_SECRET_KEY` (Supabase Edge secrets). Use `sk_test_…` with `pk_test_…` until go-live.
- [ ] Paystack webhook URL deployed and receiving events (Paystack Dashboard → **Settings** → **API & Webhooks** → recent deliveries).
- [ ] `PUBLIC_APP_URL` set for Paystack `callback_url` in `paystack-initialize` (recommended).
- [ ] Email auth: confirm-email behaviour matches your UX (see `docs/SUPABASE_DEPLOY.md`); redirect URLs include `/auth/callback` and `/auth/reset`.

## Payments

- [ ] Switch to **live** Paystack keys only when ready; webhook URL stays the same, ensure live mode events reach production.
- [ ] `paystack-initialize` records `metadata.paystack_test` from the secret key prefix (`sk_test_` → `true`) for support and dashboards.
- [ ] Apple Pay / Google Pay: enable in Paystack where supported for ZAR; still depends on customer device and dashboard settings.
- [ ] Bank / EFT channels: enable in Paystack dashboard if you offer them.
- [ ] Rate limiting: function uses `api_rate_log` (see migration `20250513000000_production.sql`). Ensure that table exists on the project; limits are per-user per minute for initialize calls.

## Security

- [ ] Row-level policies enabled on public tables; no service-role or payment secret keys in client bundles.
- [ ] Review admin policies and who has `profiles.role = 'admin'`.

## Smoke tests

- [ ] Customer: browse → tip → Paystack success → webhook → tip succeeded; guard balance increases.
- [ ] Customer: `/customer/wallet` top-up → wallet balance increases after `charge.success` (and UI refresh after returning from success).
- [ ] Guard: payout request flow records an internal payout request.
- [ ] Short link `/t/:token` while signed out → login → returns to `/customer/tip/:guardId`.
- [ ] Signup with email confirmations: user sees verify step, completes link, lands on `/onboarding` or preserved redirect.

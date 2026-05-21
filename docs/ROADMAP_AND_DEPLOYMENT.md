# TipGuard — implementation roadmap and deployment checklist

This document ties together the objectives from the production pass: auth, Supabase schema/RBAC, dashboards, QR tipping, payments, RLS, and Vercel hosting.

**Related docs:** [AUTH_SMOKE_TESTS.md](./AUTH_SMOKE_TESTS.md) · [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md) · [PRODUCTION_READINESS_AND_DEPLOYMENT.md](./PRODUCTION_READINESS_AND_DEPLOYMENT.md) · [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md)

## Current state (snapshot)

- **Auth**: Email/password, magic link, phone OTP hooks, password reset, session via Supabase client. New users receive `profiles.role = 'customer'` server-side (metadata is not trusted for privilege).
- **Checkout**: Paystack inline + Edge `paystack-initialize` / `paystack-webhook` (see `docs/PAYSTACK_SETUP.md`).
- **Schema extension**: Migration `20260615100000_tipguard_rbac_extension.sql` adds `customers`, `merchants`, `qr_codes`, `rfid_tags`, views `tip_transactions` / `payouts`, `activity_logs`, and `merchant` in `profiles.role` check.
- **App routes**: `/customer/dashboard` (customer hub), `/merchant`, `/merchant/setup`, guard and admin routes unchanged in spirit.

## Deployment checklist

### Supabase (production project)

1. Run all migrations on the production database (`supabase db push` or CI pipeline).
2. **Auth → URL configuration**: Add exact redirect URLs:
   - `https://<your-domain>/auth/callback`
   - `https://<your-domain>/auth/reset`
   - Preview URLs if you use Vercel preview deployments (wildcard or per-branch URLs).
3. **Auth → email templates**: Confirm links use your site origin where applicable.
4. **Secrets**: Set Edge Function secrets for Paystack and any future providers (see `docs/PAYSTACK_SETUP.md`, `docs/SUPABASE_DEPLOY.md`).
5. **RLS**: Re-verify policies after migration — especially `tips`, `guards`, `merchants`, `qr_codes`, and views (`tip_transactions`, `payouts` inherit underlying table RLS).
6. **Service role**: Use only in Edge Functions / server; never in the Vite client bundle.

### Vercel

1. Connect the Git repo; framework preset **Vite**.
2. Set production environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`, optional `VITE_PAYSTACK_TEST_MODE`).
3. `vercel.json` includes a SPA fallback rewrite to `index.html` for client-side routes (`/guard`, `/admin`, `/t/:token`, etc.).
4. **Custom domain**: Add domain in Vercel → update Supabase Auth redirect URLs to match.
5. Post-deploy smoke test: signup → email confirm (if enabled) → login → guard browse → test Paystack **test** keys in staging first.

### Post-deploy smoke tests

| Flow | Pass criteria |
|------|----------------|
| Signup | Profile row exists; `customers` row exists (trigger). |
| Login | Correct default route: admin → `/admin`, guard → `/guard`, merchant row/role → `/merchant`, else → `/customer/dashboard`. |
| Logout | Session cleared; protected routes redirect to `/login`. |
| Password reset | Email link hits `/auth/reset`; password update succeeds. |
| Session persistence | Refresh on a protected page stays signed in. |
| Guard QR | `tip_links` + `qr_codes` rows (after migration); `/t/:token` resolves. |

## Roadmap by objective

1. **Auth E2E** — Automate smoke tests (Playwright) against a disposable Supabase project; keep manual checklist above for first prod cut.
2. **Production Supabase** — Strict `validateClientEnv()` in prod builds; document redirect URL matrix in `docs/SUPABASE_DEPLOY.md`.
3. **Schema** — Applied via `20260615100000_tipguard_rbac_extension.sql`; regenerate TypeScript types when you adopt `supabase gen types`.
4. **RBAC** — `profiles.role` + row checks (`guards`, `merchants`); admin-only routes use `RequireAdmin`. Promote to `guard` / `merchant` role only via admin or `service_role`.
5. **Dashboards** — Customer hub, guard home/history, admin pages, merchant hub; extend with metrics RPCs later.
6. **QR tipping** — Guard flow: `tip_links` + mirrored `qr_codes`; merchant venue QR needs `resolve_*` path and checkout attribution (next increment).
7. **Payments** — `src/lib/paymentProviders.ts` registry; add Peach/Ozow Edge functions following Paystack pattern; wallet buttons follow active gateway.
8. **Production readiness** — Route guards in place; expand RLS tests; add toast on all async user actions incrementally.
9. **Deployment** — Vercel + env split (preview vs production); custom domain in Auth allow list.
10. **This document** — Keep in sync when adding migrations or routes.

## Custom domain notes

When the production URL changes, update:

- Supabase Dashboard → Authentication → **Redirect URLs**
- Paystack dashboard allowed callbacks / webhooks if domain-bound
- Any hardcoded marketing links (prefer relative URLs in-app)

---

_Last updated to match the TipGuard SA repo layout and migrations as of the RBAC extension migration._

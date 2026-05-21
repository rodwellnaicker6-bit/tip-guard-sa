# Launch checklist — TipGuard SA MVP

Use with [DEPLOY.md](../DEPLOY.md) and [docs/PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md).

## Pre-launch (blocking)

- [ ] All migrations applied (`supabase db push` or `npm run db:push`)
- [ ] Edge functions deployed: `paystack-initialize`, `paystack-verify`, `paystack-webhook`, `request-payout`
- [ ] Supabase secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL`
- [ ] Vercel env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` (test keys on staging)
- [ ] Auth redirect URLs: `/auth/callback`, `/auth/reset`
- [ ] `npm run lint && npm run build && npm run test:e2e`
- [ ] Manual: login → dashboard → refresh → logout ([BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md))
- [ ] Manual: test tip with `pk_test_` end-to-end
- [ ] Legal pages reviewed by counsel (Terms, Privacy, POPIA, Cookies, Refunds, Merchant)
- [ ] Review [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) with stakeholders

## UX go-live

- [x] Mobile overflow + touch targets verified (e2e 360px)
- [x] Offline banner + fetch retry on dashboards
- [x] Web manifest linked for add-to-home-screen
- [ ] Lighthouse mobile ≥ 80 performance on `/` (see PERFORMANCE.md)

## Security

- [ ] No `PAYSTACK_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in Vite env
- [ ] Paystack webhook HMAC verified (see `paystack-webhook` edge function)
- [ ] RLS inventory run — see [RLS_AUDIT.md](./RLS_AUDIT.md)
- [ ] Optional: `VITE_SESSION_IDLE_MINUTES` for admin sessions
- [ ] Post-MVP: admin MFA enforced (`AdminSecurity` + Supabase TOTP)

## Post-MVP (documented, not blocking)

- [ ] `paystack-reconcile` batch job
- [ ] `audit_log` writes from Edge Functions
- [ ] Rate limits wired to `api_rate_log`
- [ ] Sentry `@sentry/react` package + source maps
- [ ] Full payout reconciliation reports
- [ ] Service worker + offline QR cache

## Go / no-go

| Ready | Criteria |
|-------|----------|
| **Ready** | All blocking items checked; staging tip + auth smoke pass |
| **Ready with caveats** | Live keys pending FICA/KYC; MFA scaffold only |
| **Not ready** | RLS disabled on user table, or secret key in client bundle |

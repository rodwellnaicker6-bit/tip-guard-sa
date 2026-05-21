# TipGuard SA — deploy checklist

Short go-live list. Details: [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md), [docs/SUPABASE_DEPLOY.md](docs/SUPABASE_DEPLOY.md).

## Before deploy

- [ ] Migrations applied on Supabase (`supabase db push` or `npm run db:push`)
- [ ] Edge functions deployed: `paystack-initialize`, `paystack-webhook`, `paystack-verify`, `request-payout`
- [ ] Supabase secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL` (and service role for ops scripts only)

## Vercel / hosting env (client)

Copy from [.env.example](.env.example) — production build **requires**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PAYSTACK_PUBLIC_KEY`

Never put `SUPABASE_SERVICE_ROLE_KEY` or `PAYSTACK_SECRET_KEY` in Vite env.

## Supabase Auth

- [ ] Redirect URLs: `https://<domain>/auth/callback`, `https://<domain>/auth/reset`
- [ ] Site URL matches production domain

## Verify

```bash
npm run lint && npm run build
npm run test:auth
npm run test:e2e
```

- [ ] Login → role dashboard → sign out
- [ ] Protected routes redirect to `/login` when signed out
- [ ] Test tip with `pk_test_` on staging before live keys

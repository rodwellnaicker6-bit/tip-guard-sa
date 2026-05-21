# TipGuard SA — deploy checklist

Short go-live list. Details: [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md), [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md), [docs/RLS_AUDIT.md](docs/RLS_AUDIT.md).

## Before deploy

- [ ] Migrations applied on Supabase (`supabase db push` or `npm run db:push`)
- [ ] Edge functions deployed: `paystack-initialize`, `paystack-webhook`, `paystack-verify`, `request-payout`
- [ ] Optional post-MVP: `paystack-reconcile` (stub only)
- [ ] Supabase secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL` (service role for ops scripts only)

## Vercel / hosting env (client)

Copy from [.env.example](.env.example) — production build **requires**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PAYSTACK_PUBLIC_KEY` (`pk_test_*` or `pk_live_*` — never `sk_*`)

Optional:

- `VITE_PAYSTACK_TEST_MODE` — `true` / `false`
- `VITE_SENTRY_DSN` — error monitoring (stub in `src/lib/sentry.ts`; add `@sentry/react` post-MVP)
- `VITE_SESSION_IDLE_MINUTES` — idle sign-out (0 or unset = disabled)

Never put `SUPABASE_SERVICE_ROLE_KEY` or `PAYSTACK_SECRET_KEY` in Vite env.

## Supabase Auth

- [ ] Redirect URLs: `https://<domain>/auth/callback`, `https://<domain>/auth/reset`
- [ ] Site URL matches production domain

## SPA routing

`vercel.json` rewrites all routes to `index.html`. Unknown paths render `/404` in-app.

## Images

The MVP uses SVG logos and CSS gradients — no raster hero assets to compress. If you add PNG/WebP marketing images, serve WebP with `width`/`height`, lazy-load below the fold, and use Vite asset imports for hashed filenames.

## Verify

```bash
npm run lint && npm run build
npm run test:auth
npm run test:e2e
```

- [ ] Login → role dashboard → refresh → logout
- [ ] Protected routes redirect to `/login` when signed out
- [ ] Test tip with `pk_test_` on staging before live keys
- [ ] Legal pages reachable: `/terms`, `/privacy`, `/legal/popia`, `/legal/cookies`, `/legal/refunds`, `/legal/merchant`

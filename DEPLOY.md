# TipGuard SA — deploy checklist

Short go-live list. Details: [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md), [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md), [docs/RLS_AUDIT.md](docs/RLS_AUDIT.md).

## Before deploy

- [ ] Migrations applied on Supabase (`supabase db push` or `npm run db:push`)
- [ ] Edge functions deployed: `paystack-initialize`, `paystack-webhook`, `paystack-verify`, `request-payout`, `health`
- [ ] Optional scaffold: `notify-payment` (no email until `RESEND_API_KEY` + `NOTIFY_FROM_EMAIL` in Supabase secrets)
- [ ] Cron-ready ops: `process-webhook-retries`, `paystack-reconcile` (POST + service role; see docs/MONITORING.md)
- [ ] Optional secrets: `MAINTENANCE_MODE`, `APP_VERSION` (health JSON)
- [ ] Supabase secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL` (service role for ops scripts only)
- [ ] Production: `PAYSTACK_SECRET_KEY` only in Supabase Edge secrets (not Vercel client env).

## Vercel / hosting env (client)

In the Vercel project → **Settings → Environment Variables**, add these names exactly (Vite only exposes `VITE_*` to the browser). Apply to **Production** (and Preview/Development if you use those). Redeploy after saving.

**Required for production** (without them the live site shows a configuration screen instead of a blank page):

| Variable | Example / notes |
|----------|-----------------|
| `VITE_SUPABASE_URL` | `https://YOUR_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Anon JWT or `sb_publishable_…` from Supabase → Settings → API |
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_test_…` or `pk_live_…` — never `sk_*` |

**Optional:**

| Variable | Purpose |
|----------|---------|
| `VITE_PAYSTACK_TEST_MODE` | `true` / `false` (else inferred from `pk_test_`) |
| `VITE_SENTRY_DSN` | Error monitoring (`@sentry/react` when set) |
| `VITE_MAINTENANCE_MODE` | `true` — emergency maintenance page (redeploy required) |
| `VITE_SESSION_IDLE_MINUTES` | Idle sign-out; `0` or unset = disabled |
| `VITE_TIP_PAYMENT_GATEWAY` | `paystack` (default), `payfast`, `yoco`, etc. |
| `VITE_DEMO_MODE` | `true` for staging one-click demo login only |
| `VITE_DEMO_PASSWORD` | Password for demo login when `VITE_DEMO_MODE=true` |
| `VITE_DEBUG_BOOT` | `true` for verbose `[TipGuard:boot]` logs on one prod deploy cycle (unset after tracing) |

Never put `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, or any `sk_*` key in Vercel **client** env. Set Paystack secret and service role in **Supabase Edge** secrets only (see [.env.example](.env.example)).

## Live Paystack go-live

Use this checklist when switching from `pk_test_` to production charges:

- [ ] Paystack dashboard: live mode enabled; webhook URL `https://<project-ref>.supabase.co/functions/v1/paystack-webhook` with live secret
- [ ] Supabase secrets: `PAYSTACK_SECRET_KEY=sk_live_…` (not test secret)
- [ ] Vercel **Production**: `VITE_PAYSTACK_PUBLIC_KEY=pk_live_…`
- [ ] Vercel **Production**: `VITE_PAYSTACK_TEST_MODE=false` (removes test banner; otherwise inferred from key prefix)
- [ ] Staging/preview still uses `pk_test_` and optional `VITE_PAYSTACK_TEST_MODE=true`
- [ ] Local dev: keep `pk_test_`; `paystackEnv` warns if `pk_live_` is used with `npm run dev` (does not block prod builds)
- [ ] Smoke: one live tip ≤ R5, confirm `tips.status=succeeded` and `transactions.status=succeeded` in Supabase
- [ ] Paystack dashboard: charge appears; webhook delivery 200

## QR links & demo seed

- **Production guards:** `/guard/qr` → **Generate new link & QR** writes `tip_links.token` and `qr_codes.code_token`.
- **Staging demo data:** `npm run seed:demo` (needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) — creates demo guard with token `demo-staging-qr-01` and sample tips. See [docs/CONNECT_SUPABASE.md](docs/CONNECT_SUPABASE.md).

### Blank / black screen on production

Vite inlines `VITE_*` at **build** time. If any required variable was missing when Vercel last built, the browser throws before React mounts and `#root` stays empty (dark page, console: `Missing required production env: …`).

1. Confirm all three **required** `VITE_*` names below exist for **Production** in Vercel (not only Preview).
2. Trigger a **new production deploy** after saving env (redeploy alone is not enough if the prior build lacked keys).
3. Deploy a build that includes commit `9a726aa` or later on `main` — those versions always mount Landing and only warn when env is incomplete.
4. Optional: set `VITE_DEBUG_BOOT=true` on Production, redeploy once, reproduce in browser DevTools → Console (`[TipGuard]` one-liners), then remove the variable and redeploy again.

## Redeploy on Vercel (after env or code changes)

1. **Vercel** → your project → **Settings** → **Environment Variables** — confirm `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and (when ready) `VITE_PAYSTACK_PUBLIC_KEY` for **Production**.
2. **Deployments** → latest **Production** deployment → **⋯** → **Redeploy** (or push to `main` if Git integration is connected).
3. Wait for build to finish; open the production URL with a hard refresh (cache bypass).
4. Confirm: landing loads, login works, dashboard loads; checkout shows **Payments unavailable** only when `VITE_PAYSTACK_PUBLIC_KEY` is missing (not a blank screen).
5. Remove `VITE_DEBUG_BOOT` after startup is verified stable.

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

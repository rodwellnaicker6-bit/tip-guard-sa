# TipGuard SA

Web app for digital tipping in South Africa: customers find guards and pay; guards manage QR, earnings, and payouts; admins operate verification and queues. **React + Vite + TypeScript + Tailwind** (v4 plugin) with Supabase backend and a **multi-gateway payment abstraction** (Paystack live today).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Paystack (ZAR)](docs/PAYSTACK_SETUP.md)
- [Supabase deploy](docs/SUPABASE_DEPLOY.md)
- [Deploy checklist (short)](DEPLOY.md)
- [Production checklist](docs/PRODUCTION_CHECKLIST.md)
- [Auth smoke tests](docs/AUTH_SMOKE_TESTS.md)
- [Migrations & RLS verification](docs/MIGRATIONS_AND_RLS.md)

## Quick start

```bash
cp .env.example .env
# Fill VITE_SUPABASE_* and VITE_PAYSTACK_PUBLIC_KEY (see .env.example)

npm install
npx playwright install   # optional, for E2E
npm run dev
```

- App: http://localhost:5173  
- Apply SQL: `supabase link` then `supabase db push` (see [MIGRATIONS_AND_RLS.md](docs/MIGRATIONS_AND_RLS.md)).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production bundle (validates env in prod mode) |
| `npm run lint` | ESLint |
| `npm run test:e2e` | Playwright (starts dev server via `playwright.config.ts`) |

## Migrations

All SQL lives in `supabase/migrations/` (timestamped). Notable areas: core schema (`20250512000000_init.sql`), security (`20260209000000_security_critical.sql`), Paystack (`20260211000000_paystack_replace_stripe.sql`), RBAC extension (`20260615100000_tipguard_rbac_extension.sql`), **phase 2** sessions/notifications/QR analytics (`20260620120000_mvp_phase2_sessions_notifications.sql`).

## Route protection

See `src/components/RequireAuth.tsx`: `RequireAuth`, `RequireGuard`, `RequireMerchant`, `RequireAdmin`. Post-login redirects are centralized in `src/lib/postAuthRedirect.ts`.

## Payments

- **Default:** Paystack (`VITE_TIP_PAYMENT_GATEWAY` unset or `paystack`).
- **Abstraction:** `src/payments/registry.ts` + adapters. Add Yoco/Ozow/Peach/Apple/Google by implementing `PaymentAdapter` and wiring Edge webhooks (see [ARCHITECTURE.md](docs/ARCHITECTURE.md)).

## Security

RLS on customer/guard/admin paths; service role only in Edge. Never commit `.env` (gitignored).

## Deploy (Vercel)

1. Copy `.env.example` → Vercel **Production** env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` (never `SUPABASE_SERVICE_ROLE_KEY` or `PAYSTACK_SECRET_KEY` in the client).
2. Framework preset **Vite**; `npm run build` runs `validateClientEnv()` and fails in prod if keys are missing.
3. `vercel.json` SPA rewrite sends all routes to `index.html` (client routes like `/guard`, `/t/:token`).
4. After deploy: add `https://<domain>/auth/callback` and `/auth/reset` to Supabase Auth redirect URLs (see [Supabase deploy](docs/SUPABASE_DEPLOY.md)).
5. Smoke: login → role dashboard → test Paystack with `pk_test_` on staging first.

Full checklist: [Production checklist](docs/PRODUCTION_CHECKLIST.md) · [Roadmap & deployment](docs/ROADMAP_AND_DEPLOYMENT.md).

## Legacy UI note

Older screens still use `.shell` / CSS variables from `src/index.css`. New surfaces combine Tailwind (`dark` class on `<html>`) with those tokens; Settings toggles dark UI and high-contrast.

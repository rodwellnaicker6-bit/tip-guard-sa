# Live environment variables

**Do not commit real values.** Copy names only into Vercel / Supabase Dashboard.

**Production app:** https://tip-guard-sa.vercel.app  
**Supabase API:** `https://fyjmujhlqpvfryelnfum.supabase.co`

---

## Vercel (Production) — browser-safe `VITE_*`

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `VITE_SUPABASE_URL` | Yes | `https://fyjmujhlqpvfryelnfum.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Dashboard → Settings → API → anon or publishable key |
| `VITE_PAYSTACK_PUBLIC_KEY` | Yes | `pk_test_…` for UAT; `pk_live_…` after Paystack approval |
| `VITE_PAYSTACK_TEST_MODE` | Optional | `true` to force test behaviour if key ambiguous |
| `VITE_DEMO_MODE` | Staging only | `true` — one-click demo tiles on `/login` |
| `VITE_SUPPORT_EMAIL` | Optional | Shown on `/contact` (default `support@tipguard.co.za`) |
| `VITE_SENTRY_DSN` | Optional | Error tracking |
| `VITE_MAINTENANCE_MODE` | Optional | `true` — emergency maintenance page |
| `VITE_SESSION_IDLE_MINUTES` | Optional | e.g. `30` for admin idle sign-out |
| `VITE_TIP_PAYMENT_GATEWAY` | Optional | Default `paystack` |
| `VITE_PLAUSIBLE_DOMAIN` | Optional | Analytics |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | Optional | Analytics |

### Never on Vercel (client-exposed)

| Variable | Why |
|----------|-----|
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB bypass |
| `PAYSTACK_SECRET_KEY` | Server-only; charges and webhooks |
| `DATABASE_URL` | Direct Postgres access |
| `SUPABASE_ACCESS_TOKEN` | Account automation token |

---

## Supabase Edge secrets (`supabase secrets set`)

| Secret | Required | Notes |
|--------|----------|-------|
| `PAYSTACK_SECRET_KEY` | Yes | `sk_test_…` or `sk_live_…`; redeploy functions after change |
| `PUBLIC_APP_URL` | Yes | `https://tip-guard-sa.vercel.app` — redirects and emails |
| `PAYSTACK_PAYOUT_TRANSFERS` | Optional | `true` enables Paystack Transfer in `request-payout` |
| `RESEND_API_KEY` | Optional | `notify-payment` email |
| `NOTIFY_FROM_EMAIL` | Optional | With Resend |
| `MAINTENANCE_MODE` | Optional | Edge returns 503 on payment routes |
| `APP_VERSION` | Optional | `health` JSON |

**Injected by Supabase (do not set manually):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## Local scripts only (`.env`, not Vercel)

| Variable | Used by |
|----------|---------|
| `SUPABASE_URL` | `seed:demo`, `verify:supabase` |
| `SUPABASE_SERVICE_ROLE_KEY` | `seed:demo`, admin scripts |
| `SUPABASE_ACCESS_TOKEN` | `db:push:api`, `auth:configure` |
| `SUPABASE_PROJECT_REF` | Default `fyjmujhlqpvfryelnfum` |
| `DATABASE_URL` | `db:apply`, direct SQL |
| `DEMO_PASSWORD` | Demo users (default `TipGuardDemo2026!`) |
| `VITE_*` (same as Vercel) | Vite dev + verify scripts |

---

## Paystack Dashboard

| Setting | Value |
|---------|-------|
| Webhook URL | `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook` |
| Public key (Vercel) | Same mode as secret (`pk_test_` / `pk_live_`) |

See [.env.example](../.env.example) for full commented template.

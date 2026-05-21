# TipGuard SA — deployment readiness report

**Date:** 2026-05-15 · **Project:** `fyjmujhlqpvfryelnfum`

## Executive summary

| Metric | Value |
|--------|--------|
| **Readiness score** | Run `npm run readiness` (target **9–10/10**) |
| **Pilot-ready** | After `db:push`, Paystack keys, Edge deploy |
| **App build** | `npm run build` + `npm run lint` |

## Completed in codebase

- Migrations for payment QR, repair schema, missing RPCs (`20260624130000_missing_payment_qr_rpcs.sql`)
- Client fallbacks: `resolveTipTarget` (→ `resolve_tip_link`), `loadAdminPaymentAnalytics` (→ tips/transactions)
- Paystack env isolation (`src/lib/paystackEnv.ts`) — public key only in Vite
- Graceful errors: QR landing, payment failure reasons, auth error mapping
- Onboarding: `/onboarding`, merchant 3-step setup, guard setup links
- Scripts: `verify:supabase`, `test:auth`, `seed:demo`, `readiness`, `scan:secrets`
- Docs: [PILOT_DEPLOYMENT_CHECKLIST.md](./PILOT_DEPLOYMENT_CHECKLIST.md)

## Remaining blockers (operator)

1. **`npx supabase login && npm run db:push`** — applies `resolve_tip_target`, `admin_payment_analytics`
2. **`VITE_PAYSTACK_PUBLIC_KEY`** — `pk_test_` staging / `pk_live_` production on Vercel
3. **Supabase secrets** — `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL`; deploy `paystack-*` Edge functions
4. **Auth redirect URLs** — Site URL + `/auth/callback`, `/auth/reset` for prod domain

## Production risks

| Risk | Mitigation |
|------|------------|
| Wrong Supabase URL (`fyjum` vs `fyjmuj`) | Use `.env.example`; `env:check` |
| Service role in browser | `scan:secrets`; never `VITE_*` service key |
| Webhook not registered | Paystack → `paystack-webhook` URL |
| Partial migrations | `verify:supabase` before pilot |

## Recommended next actions (order)

1. `npm run db:push` → `npm run verify:supabase` (0 failures)
2. Set Paystack test keys → smoke `/tip/demo-staging-qr-01`
3. Deploy Vercel + Supabase Edge + webhook
4. Configure production Auth URLs
5. Run pilot checklist in [PILOT_DEPLOYMENT_CHECKLIST.md](./PILOT_DEPLOYMENT_CHECKLIST.md)
6. Rotate any keys shared in chat or logs

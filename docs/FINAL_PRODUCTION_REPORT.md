# Final production report — TipGuard SA

**Date:** 26 May 2026  
**Supabase project:** `fyjmujhlqpvfryelnfum`  
**Production app:** https://tip-guard-sa.vercel.app · https://tipguardsa.co.za  

## Executive summary

| System | Status | Notes |
|--------|--------|-------|
| Frontend (Vite/React) | **PASS** (after deploy) | Build + lint green; payment JWT propagation fixed |
| Supabase Auth → Edge | **PASS** (fix shipped) | Explicit `Bearer` user JWT on `functions.invoke` |
| Paystack initialize/verify | **PASS** (code) | Requires signed-in customer; not guest anon |
| Paystack webhook | **PASS** (code) | HMAC + idempotency; `verify_jwt = false` |
| Database / RLS | **PASS** (migrations) | Apply `20260626120000_guards_merchants_relationship.sql` on remote |
| Vercel deploy | **ACTION** | Push + `vercel deploy --prod --force` |
| Custom domain | **READY** (docs) | See DEPLOYMENT_RUNBOOK § Custom domain |
| Paystack live review | **PENDING** | Human R5 smoke + dashboard proof |

---

## 1. Auth session propagation (401 `invalid_session`)

**Root cause:** `supabase.functions.invoke` sent the **anon/publishable key** when no valid `access_token` was attached, while the Edge function calls `auth.getUser()` and returns 401 at:

`supabase/functions/paystack-initialize/index.ts` lines **67–72** (`code: "invalid_session"`).

**Fix (frontend):**

- `src/lib/paymentSession.ts` — `ensurePaymentAccessToken()` (getSession, refresh if near expiry)
- `src/services/paystackCore.ts` — pass `Authorization: Bearer <access_token>` on initialize
- `src/lib/paymentVerify.ts`, `src/pages/GuardHome.tsx` (request-payout) — same pattern
- `src/pages/QrTipLanding.tsx` — wait for `authReady` + `sessionReady` before Pay

**Product intent:** **Auth-required** for tips (not guest anon). QR flow redirects to `/login` when unsigned.

---

## 2. Deployment consistency

- Build marker: `PROD_BUILD_ACTIVE` + `build:<BUILD_ID>` in UI (`vite.config.ts`, `BuildDeployBadge`)
- Cache: `vercel.json` `no-store` on HTML/API; hashed `/assets/*` immutable
- Debug API: `GET /api/debug-env` (after deploy includes `api/debug-env.ts`)

**Operator:** commit → push → `npx vercel deploy --prod --force` (uncheck build cache in Dashboard if needed).

---

## 3. Database relationship (`guards` ↔ `merchants`)

**Error:** PostgREST embed `merchants(business_name)` failed when FK missing from schema cache.

**Fix:**

- Migration `supabase/migrations/20260626120000_guards_merchants_relationship.sql`
- Client: `GuardQR.tsx`, `MerchantQr.tsx` use separate queries (no fragile embed)

```bash
supabase db push
# or apply migration via Dashboard SQL
```

---

## 4. Paystack production readiness

| Flow | Edge / RPC | JWT | Idempotency |
|------|------------|-----|-------------|
| Initialize | `paystack-initialize` | Yes | `payment_events` init row |
| Verify | `paystack-verify` | Yes | upsert verify event |
| Webhook | `paystack-webhook` | No (HMAC) | `claim_provider_webhook_event` |
| Payout | `request-payout` | Yes | manual + optional Transfer API |
| Reconcile | `reconcile-daily` | Cron secret | daily job |

**R5 test (human):** See `DEMO_SCRIPT.md` step 6 and `PAYSTACK_REVIEW_CHECKLIST.md`.

---

## 5. Security summary

- RLS enabled on public tables; `payment_events` blocked for anon
- Edge payment routes: user JWT + `getUser()`; webhooks: HMAC only
- Rate limit: `api_rate_log` on initialize (30/min)
- Secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL` in Supabase only
- CORS: `*` on Edge payment functions (Supabase standard)
- Admin routes: `RequireAdmin` + RLS / service_role on Edge admin paths

---

## 6. QA run (automated)

```bash
npm run build   # exit 0
npm run lint    # exit 0
npm run verify:paystack   # requires .env
npm run verify:supabase
```

**Manual:** Safari/iOS Paystack inline, magic-link return to `/tip/:token`, live R5 charge.

---

## 7. Remaining blockers (user-only)

1. `git push` + Vercel production deploy with latest commit
2. `supabase db push` for relationship migration (if not applied)
3. Supabase Auth URL config: Site URL + redirect URLs for production domain(s)
4. Paystack live keys in Supabase secrets + Vercel `pk_live_`
5. Operator R5 live smoke + Paystack reviewer walkthrough

---

## URLs

| Resource | URL |
|----------|-----|
| App | https://tip-guard-sa.vercel.app |
| Supabase API | https://fyjmujhlqpvfryelnfum.supabase.co |
| Webhook | https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook |
| Initialize | https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-initialize |

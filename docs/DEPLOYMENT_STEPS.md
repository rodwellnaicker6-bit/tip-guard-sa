# Deployment steps — TipGuard SA (ordered)

**Production URL:** https://tip-guard-sa.vercel.app  
**Supabase project:** `fyjmujhlqpvfryelnfum`

Run from repo root on `main` after `git pull`. Never commit `.env` or secrets.

---

## 1. Preconditions

- [ ] `npx supabase login` **or** `SUPABASE_ACCESS_TOKEN` in environment
- [ ] `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for scripts (local only)
- [ ] Paystack test keys for UAT; live keys only after sign-off

---

## 2. Database

```bash
supabase link --project-ref fyjmujhlqpvfryelnfum
supabase db push --yes
```

Confirm `supabase migration list` shows no local-only rows (latest: `20260626100000`).

Optional demo data:

```bash
npm run seed:demo
npm run verify:supabase
```

**Note:** `npm run db:push` also runs seed + verify but requires CLI auth via `projects list`.

---

## 3. Supabase Edge secrets

```bash
supabase secrets set PAYSTACK_SECRET_KEY="sk_test_..."   # or sk_live_ after UAT
supabase secrets set PUBLIC_APP_URL="https://tip-guard-sa.vercel.app"
# Optional:
# supabase secrets set PAYSTACK_PAYOUT_TRANSFERS=true
# supabase secrets set RESEND_API_KEY="re_..." NOTIFY_FROM_EMAIL="payments@..."
```

---

## 4. Deploy Edge functions

```bash
supabase functions deploy \
  paystack-initialize paystack-verify paystack-webhook \
  request-payout process-webhook-retries reconcile-daily \
  health notify-payment
```

**Paystack webhook URL (Dashboard):**

`https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`

Events: `charge.success`, `charge.failed` (add transfer events when automating payouts).

---

## 5. Auth URLs (Supabase Dashboard)

| Setting | Production value |
|---------|------------------|
| Site URL | `https://tip-guard-sa.vercel.app` |
| Redirect URLs | `https://tip-guard-sa.vercel.app/auth/callback` |
| | `https://tip-guard-sa.vercel.app/auth/reset` |

Or: `npm run auth:configure` with `SUPABASE_ACCESS_TOKEN`.

---

## 6. Schedule cron (operator)

See [CRON.md](./CRON.md) or `scripts/schedule-cron-jobs.sql`:

- `process-webhook-retries` — every 15 minutes
- `reconcile-daily` — daily 02:00 SAST (00:00 UTC)

Header: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.

---

## 7. Vercel frontend (requires user token)

Vite inlines `VITE_*` at **build** time. After changing env vars, redeploy:

```bash
# From machine with Vercel CLI logged in:
vercel --prod
```

Or: Vercel Dashboard → Project → Deployments → Redeploy Production.

Env names: [LIVE_ENV_VARIABLES.md](./LIVE_ENV_VARIABLES.md).

**This agent cannot redeploy Vercel without the operator's Vercel token.**

---

## 8. Automated verification

```bash
npm run build
npm run lint
npm run verify:supabase
npm run verify:paystack
npm run smoke:production
npx tsx scripts/stress-qr-resolve.ts demo-staging-qr-01 50
npx playwright install
npm run test:e2e -- --workers=1
```

---

## 9. Manual smoke (production URL)

- [ ] `/terms`, `/privacy`, `/legal/refunds`, `/legal/popia`, `/contact`
- [ ] `/qr/demo-staging-qr-01` resolves (after `seed:demo`)
- [ ] One Paystack test tip → webhook → balance update
- [ ] Admin `/admin/transactions` loads for demo admin

---

## 10. Rollback

- **Frontend:** Vercel → previous deployment → Promote to Production
- **Edge:** redeploy prior function bundle from git tag
- **DB:** do not revert applied migrations without DBA plan; use forward-fix migrations only

See [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md).

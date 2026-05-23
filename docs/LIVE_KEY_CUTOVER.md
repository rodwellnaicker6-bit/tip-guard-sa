# Live key cutover (`pk_test` / `sk_test` → `pk_live` / `sk_live`)

Step-by-step for the operator. Complete [COMPLIANCE_SIGNOFF.md](./COMPLIANCE_SIGNOFF.md) and Phase 0 exit before live keys ([BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)).

**You must paste real keys from Paystack Dashboard** — agents do not have your `pk_live_` / `sk_live_` values.

---

## Step 0 — Pre-flight

- [ ] Phase 0: 7 days stable payouts + webhooks + recon = 0 mismatch
- [ ] `npm run build && npm run lint && npm run verify:supabase && npm run verify:paystack` green on `main`
- [ ] Cron jobs scheduled ([CRON_OPERATOR_RUNBOOK.md](./CRON_OPERATOR_RUNBOOK.md))
- [ ] Secure vault copy of **current test keys** for rollback

---

## Step 1 — Paystack Dashboard (live merchant)

1. Log in to [Paystack Dashboard](https://dashboard.paystack.com).
2. Confirm live merchant / ZAR is **activated** (not test-only).
3. **Settings** → **API Keys & Webhooks**.
4. Copy **Live Public Key** (`pk_live_…`) — for Vercel only.
5. Copy **Live Secret Key** (`sk_live_…`) — for Supabase only; never commit or paste into Vercel.
6. **Webhook URL** (must already be set):

   `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`

7. Enable webhook events: `charge.success`, `charge.failed`, and transfer events if using automated payouts (`transfer.success`, `transfer.failed`, `transfer.reversed`).
8. Save. The webhook HMAC uses the **same** secret key you set in Supabase in Step 2.

---

## Step 2 — Supabase Edge secrets

1. [Supabase Dashboard](https://supabase.com/dashboard) → project `fyjmujhlqpvfryelnfum` → **Project Settings** → **Edge Functions** → **Secrets**.
2. Set:

   | Secret | Value |
   |--------|--------|
   | `PAYSTACK_SECRET_KEY` | `sk_live_…` (paste from Step 1) |

3. Confirm `PUBLIC_APP_URL` is production (`https://tip-guard-sa.vercel.app` or `https://yourdomain.co.za`).
4. CLI alternative:

   ```bash
   supabase link --project-ref fyjmujhlqpvfryelnfum
   supabase secrets set PAYSTACK_SECRET_KEY="sk_live_..."
   ```

5. Redeploy Edge functions:

   ```bash
   supabase functions deploy \
     paystack-initialize paystack-verify paystack-webhook \
     request-payout process-webhook-retries reconcile-daily
   ```

6. Run `npm run verify:paystack` (exit 0).

---

## Step 3 — Vercel Production env

1. [Vercel Dashboard](https://vercel.com/dashboard) → TipGuard project → **Settings** → **Environment Variables**.
2. Edit **Production** only:

   | Variable | Value |
   |----------|--------|
   | `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_…` |
   | `VITE_PAYSTACK_TEST_MODE` | delete, or set `false` |
   | `VITE_SUPABASE_URL` | unchanged |
   | `VITE_SUPABASE_ANON_KEY` | unchanged |

3. **Save** each variable.
4. **Deployments** → Production → **Redeploy** (uncheck build cache if unsure). See [DEPLOYMENT_STEPS.md §7](./DEPLOYMENT_STEPS.md#7-vercel-frontend--redeploy-production).

CLI (after `vercel login` + `vercel link`):

```bash
npx vercel@latest env add VITE_PAYSTACK_PUBLIC_KEY production
# paste pk_live_... when prompted
npx vercel@latest env rm VITE_PAYSTACK_TEST_MODE production   # if present
npx vercel@latest deploy --prod
```

5. Open production URL — confirm **no** test-mode banner on home.

---

## Step 4 — Live smoke (human)

Follow [OPERATOR_LIVE_SMOKE.md](./OPERATOR_LIVE_SMOKE.md):

- [ ] One **R10** live tip on `/qr/demo-staging-qr-01` (or pilot merchant QR)
- [ ] `tips` + `payment_events` succeeded ([AUDIT_LOGGING.md](./AUDIT_LOGGING.md))
- [ ] Paystack live dashboard shows charge
- [ ] One demo guard payout: request → admin approve → `paid`

---

## Step 5 — Monitoring (first 24h)

- [ ] [OPERATOR_DAILY_CHECKLIST.md](./OPERATOR_DAILY_CHECKLIST.md) twice on day 1
- [ ] Alerts per [MONITORING.md](./MONITORING.md) (DLQ > 5, recon mismatch, health down)
- [ ] Submit Paystack review pack if required: [PAYSTACK_SUBMISSION.md](./PAYSTACK_SUBMISSION.md)

---

## Rollback (if smoke fails)

1. Paystack + Supabase: restore `sk_test_…` in `PAYSTACK_SECRET_KEY`.
2. Vercel: restore `pk_test_…` and `VITE_PAYSTACK_TEST_MODE=true`.
3. Redeploy Edge functions + Vercel Production.
4. Enable `VITE_MAINTENANCE_MODE` if partial outage ([ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)).
5. Post-mortem in [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md).

---

## Related

- [VERCEL_ENV_SETUP.md](./VERCEL_ENV_SETUP.md)
- [LIVE_ENV_VARIABLES.md](./LIVE_ENV_VARIABLES.md)
- [PAYSTACK_SETUP.md](./PAYSTACK_SETUP.md)
- [DEPLOY.md](../DEPLOY.md)

# TipGuard SA — Pre-launch deployment checklist

**Last updated:** 2026-05-25  
**Target:** https://tipguardsa.co.za (Vercel Production) + Supabase `fyjmujhlqpvfryelnfum`

Use this checklist before promoting a release. Pair with [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) and [MONITORING_CHECKLIST.md](./MONITORING_CHECKLIST.md).

---

## 1. Pre-merge (developer)

- [ ] `npm run build` — pass
- [ ] `npm run lint` — pass
- [ ] `npm run readiness` — 10/10
- [ ] `npm run verify:supabase` — pass
- [ ] `npm run verify:paystack` — pass (test or live keys match dashboard)
- [ ] No secrets in diff (`npm run scan:secrets`)
- [ ] Onboarding: `[TipGuard:onboarding]` logs present in `Onboarding.tsx` / `AuthProvider.tsx`

---

## 2. Database migrations (apply in order)

Through at minimum:

| Migration | Purpose |
|-----------|---------|
| `20260626140000_tip_checkout_schema_hotfix.sql` | `get_platform_fee_bps`, tip/tx columns |
| `20260626150000_save_onboarding_role_rpc.sql` | Onboarding RPC |
| `20260626170000_security_hardening_rls.sql` | `platform_settings` RLS, anon RPC revoke |
| `20260626180000_save_onboarding_role_fix.sql` | Merchant/guard role correction |

```bash
npm run db:push   # or Supabase Dashboard → Migrations
```

- [ ] `save_onboarding_role` executable by `authenticated`
- [ ] `platform_settings` has RLS enabled
- [ ] Optional: set 2% fee — `update platform_settings set fee_bps = 200 where id = 1;`

---

## 3. Supabase Edge Functions

Deploy after DB:

```bash
supabase functions deploy paystack-initialize
supabase functions deploy paystack-webhook
supabase functions deploy paystack-verify
supabase functions deploy request-payout
```

**Secrets (Dashboard → Edge → Secrets):**

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `PAYSTACK_SECRET_KEY` (`sk_test_*` or `sk_live_*` — never in git)

**Paystack Dashboard:**

- [ ] Webhook URL: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-webhook`
- [ ] Test vs live dashboard matches deployed keys

---

## 4. Vercel (frontend)

**Production env:**

- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_PAYSTACK_PUBLIC_KEY` (`pk_test_*` or `pk_live_*`)
- [ ] Optional: `VITE_SENTRY_DSN`

**Deploy:**

```bash
git push origin main
vercel --prod --yes
```

- [ ] `curl -sS https://tipguardsa.co.za/ | grep tipguard-git-sha` matches release commit
- [ ] `/api/debug-env` — `hasPaystackPublicKey: true`, no raw secrets in JSON

---

## 5. Post-deploy smoke

```bash
npm run smoke:production
```

**Manual (required once per release):**

- [ ] Merchant onboarding: role → profile → finish → `/merchant` or `/merchant/setup`
- [ ] `/tip/demo-staging-qr-01` resolves (after `npm run seed:demo` if needed)
- [ ] Paystack test card flow → `/payment/success`
- [ ] Hard refresh after deploy (Cmd+Shift+R)

---

## 6. Go / no-go

| Gate | Owner |
|------|-------|
| Automated readiness 10/10 | CI / operator script |
| Manual E2E signed-in | Product owner |
| Paystack live keys | Finance + [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md) |
| POPIA / terms live | Compliance |

**No-go if:** webhook HMAC fails, onboarding stuck on Saving >15s without fail-safe log, or `service_role` in client bundle.

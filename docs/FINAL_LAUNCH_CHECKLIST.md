# Final launch checklist — operator

**Target:** https://tip-guard-sa.vercel.app  
**Report:** [FINAL_PRODUCTION_REPORT.md](./FINAL_PRODUCTION_REPORT.md)

---

## Engineering (automated — 22 May 2026)

- [x] Edge functions deployed (8)
- [x] Migration `20260626100000` applied on remote
- [x] `build`, `lint`, `verify:supabase`, `verify:paystack`, `smoke:production`
- [x] QR stress 50× — 0 errors
- [ ] E2E 35/35 (33/35 today — refresh demo seed for customer test)
- [ ] Lighthouse scores recorded (optional)

---

## Operator (before public live traffic)

- [ ] Vercel Production env set per [LIVE_ENV_VARIABLES.md](./LIVE_ENV_VARIABLES.md)
- [ ] `vercel --prod` (requires your Vercel CLI login)
- [ ] Paystack webhook URL + HMAC secret match Supabase
- [ ] Auth Site URL + redirect URLs → production domain
- [ ] Cron: `process-webhook-retries` + `reconcile-daily` ([CRON.md](./CRON.md))
- [ ] `npm run seed:demo` if demo QR/tests needed
- [ ] One test tip on `/qr/demo-staging-qr-01`
- [ ] One live tip after `pk_live_` / `sk_live_` cutover
- [ ] Paystack review pack: [PAYSTACK_REVIEW_CHECKLIST.md](./PAYSTACK_REVIEW_CHECKLIST.md)
- [ ] Beta sign-off: [BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md)

---

## GO / NO-GO

| Launch type | Status |
|-------------|--------|
| Paystack review (test mode) | **GO** |
| Production live keys + marketing | **GO** after cron + Vercel redeploy + one live E2E |

---

## Quick commands

```bash
supabase db push --yes
supabase functions deploy paystack-initialize paystack-verify paystack-webhook request-payout process-webhook-retries reconcile-daily health notify-payment
npm run verify:supabase && npm run verify:paystack && npm run smoke:production
vercel --prod   # operator token required
```

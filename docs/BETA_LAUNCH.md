# TipGuard SA — beta launch

## Pre-flight (operator)

1. `npm run db:push` → `npm run verify:supabase`
2. Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`
3. Supabase secrets: `PAYSTACK_SECRET_KEY`, `PUBLIC_APP_URL`
4. Auth redirects: Site URL + `/auth/callback`, `/auth/reset`
5. Paystack webhook → `paystack-webhook` Edge function

## Automated checks

```bash
npm run verify:paystack   # webhook HMAC, Paystack API, transactions table
npm run test:auth
npm run verify:supabase
```

## Smoke test (15 min)

- Register → verify email → onboarding
- Login / logout / password reset
- `/tip/demo-staging-qr-01` → tip (Paystack test card)
- Admin analytics + transactions
- Guard QR download

## NFC (future)

Web NFC types in `src/lib/nfc.ts` — merchant cards, staff badges, tap-to-tip. Provision tags with `tipguard://tip/{token}`.

See [PILOT_DEPLOYMENT_CHECKLIST.md](./PILOT_DEPLOYMENT_CHECKLIST.md).

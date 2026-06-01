# Guest tip checkout (anonymous auth)

QR tipping uses `signInAnonymously()` so payers do not need an account before Paystack.

## Enable on production

1. Supabase Dashboard → **Authentication** → **Providers** → enable **Anonymous sign-ins**,  
   **or** run:

   ```bash
   # SUPABASE_ACCESS_TOKEN in .env
   npm run auth:enable-guest
   ```

   Do **not** run `supabase config push` from a dev `config.toml` without matching production `site_url` and redirect URLs.

2. Deploy the SPA (`npx vercel deploy --prod`).

## Verify

```bash
npm run probe:payment
npm run verify:production
npm run reset:demo-tip-link   # before re-testing demo-staging-qr-01 in browser
```

Expect: anonymous OK, `paystack-initialize` HTTP 200 with `authorization_url`, tip page shows **Pay R …** (not “Sign in to pay”).

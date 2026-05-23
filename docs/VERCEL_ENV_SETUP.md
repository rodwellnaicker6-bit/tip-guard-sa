# Vercel environment setup (TipGuard SA)

Sync **client-only** `VITE_*` variables from local `.env` to Vercel. Copy full values from your machine’s `.env` — do not commit `.env`.

## Security

- **Set on Vercel:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`, `VITE_PAYSTACK_TEST_MODE`, `VITE_DEMO_MODE`
- **Never set on Vercel (client):** `PAYSTACK_SECRET_KEY`, any `sk_*` secret keys, or server-only secrets

## Variables (from local `.env`)

| Name | Example / mask | Production | Preview |
|------|----------------|------------|---------|
| `VITE_SUPABASE_URL` | `https://fyjm…` | Yes | Yes |
| `VITE_SUPABASE_ANON_KEY` | `sb_publi…` | Yes | Yes |
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_test_…` | Yes | Yes |
| `VITE_PAYSTACK_TEST_MODE` | `true` | Yes | Yes |
| `VITE_DEMO_MODE` | `true` | Yes | Yes |

Use the **exact** values from `/Users/rodwe/tipguard-sa/.env` for the three masked keys above.

## Dashboard steps

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → **TipGuard SA** project (or import repo `tipguard-sa` if not linked).
2. **Settings** → **Environment Variables**.
3. For each row in the table above:
   - **Key:** variable name (e.g. `VITE_SUPABASE_URL`)
   - **Value:** paste from local `.env`
   - **Environments:** check **Production** and **Preview**
   - Click **Save**
4. **Deployments** → latest **Production** deployment → **⋯** → **Redeploy** → enable **Use existing Build Cache** (optional) → **Redeploy**.

Or after linking the CLI locally:

```bash
cd /Users/rodwe/tipguard-sa
npx vercel@latest login
npx vercel@latest link
# Set each var (paste value when prompted; repeat for preview with --environment preview)
npx vercel@latest env add VITE_SUPABASE_URL production
npx vercel@latest env add VITE_SUPABASE_ANON_KEY production
npx vercel@latest env add VITE_PAYSTACK_PUBLIC_KEY production
npx vercel@latest env add VITE_PAYSTACK_TEST_MODE production
npx vercel@latest env add VITE_DEMO_MODE production
npx vercel@latest deploy --prod
```

## Production live keys (placeholders — operator pastes real values)

User did not provide `pk_live_` / `sk_live_` in chat. Set these manually after Paystack approves live mode:

| Where | Variable | Placeholder | Real value source |
|-------|----------|-------------|-------------------|
| Vercel Production | `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_REPLACE_ME` | Paystack → API Keys → Live Public |
| Vercel Production | `VITE_PAYSTACK_TEST_MODE` | remove or `false` | — |
| Supabase Edge secrets | `PAYSTACK_SECRET_KEY` | `sk_live_REPLACE_ME` | Paystack → Live Secret (**never** Vercel) |

```bash
# After vercel login + link on operator machine:
npx vercel@latest env add VITE_PAYSTACK_PUBLIC_KEY production
# When prompted, paste pk_live_... from Paystack Dashboard

# Supabase (never use vercel env for sk_live):
supabase secrets set PAYSTACK_SECRET_KEY="sk_live_..."
```

Full cutover: [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md).

## CLI status (automated run — May 2026)

- `npx vercel@latest`: available (v54.4.x)
- Auth: **not logged in** (device OAuth at `https://vercel.com/oauth/device` — agent cannot complete)
- `.vercel/project.json`: **not present** (project not linked locally)
- `vercel env add`: **not run** — use Dashboard or CLI after login

## Verify after redeploy

1. Open the production URL from the redeploy output.
2. In browser devtools → **Network**, confirm Supabase requests use your project host.
3. Paystack checkout should use the **public** key only (`pk_test_…` in test mode).

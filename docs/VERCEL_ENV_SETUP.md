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

## CLI status (automated run)

- Global `vercel` CLI: **not installed**
- `npx vercel@latest`: available (v54.4.0)
- Auth: **not logged in** (device OAuth required; non-interactive session could not complete)
- `.vercel/project.json`: **not present** (project not linked locally)

## Verify after redeploy

1. Open the production URL from the redeploy output.
2. In browser devtools → **Network**, confirm Supabase requests use your project host.
3. Paystack checkout should use the **public** key only (`pk_test_…` in test mode).

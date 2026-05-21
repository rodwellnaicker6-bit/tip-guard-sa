# Backend deployment

Notes for the `supabase/` tree. CLI examples use the Supabase toolchain; if you host the same code elsewhere, map these steps to your environment.

## Database

From the repo root (with the CLI linked to your project):

```bash
supabase db push
```

Migrations live in `supabase/migrations/`. They are **additive**; do not delete tables or data casually on deployed databases.

## Auth (email confirmations)

In the Supabase Dashboard go to **Authentication → Providers → Email** (or Auth settings, depending on dashboard version):

- **Confirm email** (`enableConfirmations` / “Enable email confirmations”): when on, new users do not receive a session until they click the link in the signup email. The TipGuard app shows a “check your email” step after `signUp` and supports `supabase.auth.resend` for signup verification. Add your site URL and `/auth/callback` under **Redirect URLs** so the link returns users to the app.
- When confirmations are **off** (common in local dev), `signUp` returns a session immediately and the app sends users to `/onboarding`.

Password reset emails should allow redirects to your deployed `/auth/reset` route (already used by `resetPasswordForEmail`).

## Server routes (`supabase/functions`)

Set secrets (dashboard **Edge Functions → Secrets** or CLI). Payment flows need at least:

```bash
supabase secrets set PAYSTACK_SECRET_KEY="<secret_key_from_paystack_dashboard>"
```

Deploy each function directory under `supabase/functions/`, skipping `_shared`:

```bash
for d in supabase/functions/*/; do
  name=$(basename "$d")
  [ "$name" = "_shared" ] || supabase functions deploy "$name"
done
```

JWT verification for HTTP routes is controlled in `supabase/config.toml` (for example, webhook routes often skip browser JWT verification). Change only if you understand the security implications.

## Runtime env (injected by the host)

These are typically provided automatically inside deployed functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional value you set yourself:

- `PUBLIC_APP_URL` — canonical public site URL for Paystack `callback_url` in `paystack-initialize` (recommended).

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `PAYSTACK_SECRET_KEY` to the browser.

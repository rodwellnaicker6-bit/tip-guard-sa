# Production audit - 2026-05-25

Target: https://tipguardsa.co.za

## Live checks completed

- `https://tipguardsa.co.za` returns `200` from Vercel with security headers:
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
  `Referrer-Policy: strict-origin-when-cross-origin`.
- `http://tipguardsa.co.za` redirects to `https://tipguardsa.co.za/`.
- `https://tipguardsa.co.za/login` renders and the auth boot banner reports
  Supabase configured and auth ready.
- Protected routes such as `/guard` and `/customer/tip/test` redirect to login
  for unauthenticated visitors.
- `/auth/callback` without a valid auth token shows a recoverable auth error
  instead of hanging.

## Production issues found

1. **Paystack public env is missing from the deployed Vite bundle.**
   The live banner reports `Payments off` / `Payments unavailable`, which means
   `VITE_PAYSTACK_PUBLIC_KEY` is absent or empty in Vercel Production.
   Set the browser-safe public key only (`pk_test_...` for sandbox/UAT or
   `pk_live_...` after Paystack live approval), then redeploy.

2. **`www.tipguardsa.co.za` TLS is not launch-ready.**
   `https://www.tipguardsa.co.za` returns a redirect to the apex domain only
   when TLS verification is bypassed; normal clients fail certificate validation
   because the certificate does not cover `www.tipguardsa.co.za`.
   Fix DNS/Vercel domain assignment for `www`, or remove the `www` record.

3. **Vercel environment variables could not be audited directly from this agent.**
   The repository is not linked with `.vercel/project.json`, and the Vercel CLI
   is not installed/authenticated in this environment. The live bundle behavior
   is therefore the source of truth for client env presence in this audit.

4. **Canonical callback configuration must be updated to the production domain.**
   Set `VITE_PUBLIC_APP_URL=https://tipguardsa.co.za` in Vercel and
   `PUBLIC_APP_URL=https://tipguardsa.co.za` in Supabase Edge secrets so Supabase
   Auth redirects and Paystack callback URLs use the production domain.

## Stabilization changes made in this branch

- Added bounded auth/session requests so hung Supabase auth calls surface a
  recoverable error.
- Added a protected-route timeout fallback so auth-gated pages do not display
  skeleton loading indefinitely.
- Added `VITE_PUBLIC_APP_URL` support for canonical auth redirect origins.
- Updated environment docs/templates for `https://tipguardsa.co.za`.

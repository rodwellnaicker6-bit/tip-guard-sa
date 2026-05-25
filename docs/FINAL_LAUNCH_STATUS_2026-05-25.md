# Final launch status - 2026-05-25

Production domain: https://tipguardsa.co.za

## Status: NOT READY

The application shell, auth public routes, protected-route redirects, mobile layout, security scan,
lint, and production build are healthy. Final launch is blocked by production environment/domain
configuration that cannot be completed from this unauthenticated agent.

## Environment variable verification

| Variable | Status | Evidence / action |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Present in live bundle | Live client bundle contains `https://fyjmujhlqpvfryelnfum.supabase.co`; boot banner reports `Supabase ok`. |
| `VITE_SUPABASE_ANON_KEY` | Inferred present | Supabase browser client initializes and live boot banner reports `Supabase ok`; exact value was not printed or exposed. |
| `VITE_PAYSTACK_PUBLIC_KEY` | Missing in live bundle | Live boot banner reports `Payments off` / `Payments unavailable`; bundle scan found no `pk_test_*` or `pk_live_*`. |
| `PAYSTACK_SECRET_KEY` | Not verifiable from this agent | Must be set as a Supabase Edge secret for `paystack-initialize`, `paystack-verify`, and `paystack-webhook`; no `sk_*` secret appears in the client bundle. |
| `PUBLIC_APP_URL` | Not verifiable from this agent | Must be set in Supabase Edge secrets as `https://tipguardsa.co.za` for Paystack callback URLs. |
| `VITE_PUBLIC_APP_URL` | Not live yet | Added in this branch; set in Vercel Production as `https://tipguardsa.co.za` and redeploy. |

Vercel Dashboard/CLI verification could not be completed: `npx vercel@latest env ls` and
`npx vercel@latest deploy --prod --yes` both started an OAuth device login flow because this
machine has no Vercel credentials and the repo is not linked with `.vercel/project.json`.

## Paystack status

| Area | Status | Notes |
| --- | --- | --- |
| Frontend public key | Blocked | Production bundle has no Paystack public key, so checkout is disabled before modal open. |
| Inline script loading | Hardened in branch | Added timeout/retry behavior so script load cannot hang indefinitely. |
| Payment initialize | Code path present, live unverified | `paystack-initialize` validates auth, rate limits, creates pending records, calls Paystack, logs `payment_events`, and uses `PUBLIC_APP_URL` for callback URL. Live verification needs auth + Paystack env. |
| Callback verification | Code path present, live unverified | `paystack-verify` calls Paystack verify, updates succeeded/failed statuses, and logs `payment_events`. |
| Webhook validation | Code path present | `paystack-webhook` validates `x-paystack-signature` using HMAC SHA-512 before processing. |
| Failed payment handling | Verified safe fallback page | `/payment/failure?reason=cancelled&kind=tip` renders safely and says no funds move until provider success. |
| Secret exposure | Pass | `npm run scan:secrets` passed; live bundle scan found no `sk_*`, `PAYSTACK_SECRET_KEY`, or service-role strings. |

## Domain and SSL status

| Check | Status | Evidence / action |
| --- | --- | --- |
| `https://tipguardsa.co.za` | Pass | Returns HTTP 200 from Vercel with security headers. |
| `http://tipguardsa.co.za` | Pass | Redirects to `https://tipguardsa.co.za/`. |
| `https://www.tipguardsa.co.za` | Blocked | TLS certificate validation fails before redirect: certificate does not cover `www.tipguardsa.co.za`. |
| Canonical redirect | Improved in branch | Added Vercel host redirect from `www.tipguardsa.co.za` to apex. DNS/Vercel certificate still must be fixed or `www` DNS removed. |

## Production verification

| Check | Status |
| --- | --- |
| Landing page loads | Pass |
| Login page renders | Pass |
| Protected routes redirect unauthenticated users | Pass |
| No infinite loading on checked public/protected routes | Pass |
| Mobile responsive smoke at 390px | Pass |
| Payment failure UI | Pass |
| Payment modal | Blocked by missing `VITE_PAYSTACK_PUBLIC_KEY` in production |
| Auth with real credentials | Not verified - no production credentials available in this agent |
| Session persistence | Not verified - requires real production credentials |
| Supabase connection | Reachable; live app reports `Supabase ok`; unauthenticated health endpoint returns 401 |
| Error route | Pass (`/404`) |
| Runtime error boundary | Not force-tested in production |

## Verification commands run

- `npm run build` - pass
- `npm run lint` - pass
- `npm run scan:secrets` - pass
- `npx playwright test e2e/boot-startup.spec.ts e2e/auth-public-and-guards.spec.ts` - pass, 14 tests
- Live browser smoke against `https://tipguardsa.co.za` - pass for landing/login/protected redirect/failure page/error route/mobile; `payments_unavailable=true`
- `npm run smoke:production` - fail because local `.env` is absent in this agent (`VITE_SUPABASE_*`, `VITE_PAYSTACK_PUBLIC_KEY`, `SUPABASE_URL`, and Paystack secret checks cannot run)
- `npx vercel@latest deploy --prod --yes` - blocked by Vercel OAuth login requirement

## Immediate next steps

1. In Vercel Production, set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_PAYSTACK_PUBLIC_KEY`
   - `VITE_PUBLIC_APP_URL=https://tipguardsa.co.za`
2. In Supabase Edge secrets, set:
   - `PAYSTACK_SECRET_KEY`
   - `PUBLIC_APP_URL=https://tipguardsa.co.za`
3. Redeploy Supabase Edge functions after changing secrets.
4. Fix `www.tipguardsa.co.za` in Vercel/Hostinger:
   - either add `www.tipguardsa.co.za` as a Vercel domain until the certificate is issued, or
   - remove the `www` DNS record entirely.
5. Redeploy Vercel Production from the latest committed branch/main build.
6. Re-run live payment initialization with a real authenticated user and Paystack sandbox/live-approved keys.

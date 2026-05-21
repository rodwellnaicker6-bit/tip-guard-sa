# Auth smoke tests (manual)

Run these against your deployed app or `npm run dev` with a real `.env` (not placeholders). Use a **disposable email** (or `+alias`) for signup tests.

## Preconditions

- [ ] Supabase **Authentication → URL configuration** includes:
  - `http://localhost:5173/auth/callback` (dev)
  - `http://localhost:5173/auth/reset` (dev)
  - Production equivalents for your Vercel domain
- [ ] Email provider (or Supabase default) delivers messages; check spam.
- [ ] Optional: disable captcha for the test window, or complete it manually.

## 1. Signup

1. Open `/register`.
2. Submit name, email, password, role **Customer**.
3. **Expected:** No console errors; either:
   - **Email confirmation off:** immediate session → redirect toward onboarding; `profiles` row exists with `role = 'customer'`.
   - **Email confirmation on:** “Verify your email” step; **no** long-lived session until link clicked.

**Verify in Supabase (Table Editor → `profiles`):** new row `id` = auth user UUID, `role` = `customer` (never elevated from client metadata).

## 2. Email verification (when confirmations enabled)

1. Complete signup as above until verify step.
2. Open the link in the email (same browser is fine).
3. **Expected:** lands on `/auth/callback` briefly, then `/onboarding` or stored `tipguard_redirect` path; session present.

## 3. Login

1. Sign out (or use a private window).
2. Open `/login`, submit valid credentials.
3. **Expected:** redirect by role — admin → `/admin`, guard row or role guard → `/guard`, merchant row or role → `/merchant`, else → `/customer/dashboard`.

## 4. Logout

1. From `/settings` or a dashboard, use **Sign out** (or `signOut` wherever exposed).
2. **Expected:** session cleared; refresh on `/guard` or `/customer/dashboard` sends you to `/login`.

## 5. Session persistence

1. Log in, open `/customer/dashboard` (or guard dashboard).
2. Hard refresh (Cmd+Shift+R / Ctrl+Shift+R).
3. **Expected:** still authenticated; no redirect to login.

## 6. Password reset

1. Sign out; open `/forgot-password`, enter account email, submit.
2. **Expected:** success copy (generic “if account exists…”); email arrives with reset link.
3. Open link → `/auth/reset` should establish recovery session → `/auth/reset` form (or hash tokens handled on same URL per Supabase template).
4. Set new password → redirect to login with success message; sign in with new password.

> If the reset link uses query `code=`, the app exchanges it in `PasswordReset` and `AuthCallback` flows. Ensure `/auth/reset` is in Supabase redirect allow list.

## 7. Automated sanity (optional)

With dev server running:

```bash
npm install
npx playwright install   # downloads Chromium for your OS/arch (not only `chromium`)
npm run test:e2e
```

This checks auth pages render and unauthenticated users are kept off protected routes (see `e2e/`). The config starts the dev server unless `CI` is set.

If **Chromium crashes on launch** (`SEGV`, `browserType.launch` timeout), use the system Chrome channel:

```bash
PW_CHANNEL=chrome npm run test:e2e
```

(Google Chrome must be installed; Playwright still needs `npx playwright install chrome` for channel support on some setups.)

## 8. Guard QR generation (after migrations)

Prerequisites: `tip_links` and `qr_codes` tables exist (`20250513000000_production.sql`, `20260615100000_tipguard_rbac_extension.sql`).

1. Sign in as a guard user with a completed `guards` row.
2. Open `/guard/qr`, click **New tip link**.
3. **Expected:** URL `https://<your-app>/t/<token>` appears; no error in UI.
4. **Supabase:** New row in `tip_links` for your `guard_id`; new row in `qr_codes` with the same `code_token`.
5. Open the URL in a fresh tab (customer flow): should resolve toward checkout (sign-in may be required).

# Operator login smoke test

Quick manual check that production (or staging) login, session persistence, and logout work end-to-end.

## Production URL

- Login: https://tip-guard-sa.vercel.app/login

Use real merchant/guard/customer/admin accounts created for production. Demo one-click buttons only appear when `VITE_DEMO_MODE=true` (staging; not production).

## Staging / demo (after seed)

Prerequisites:

```bash
# .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm run seed:demo
```

Default password (override with `DEMO_PASSWORD` in env):

| Role     | Email                              | Password (default)   | Expected dashboard after login |
|----------|------------------------------------|----------------------|--------------------------------|
| Customer | `demo-customer@tipguard.staging`   | `TipGuardDemo2026!`  | `/customer/dashboard`          |
| Merchant | `demo-merchant@tipguard.staging`   | `TipGuardDemo2026!`  | `/merchant`                    |
| Guard    | `demo-guard@tipguard.staging`      | `TipGuardDemo2026!`  | `/guard`                       |
| Admin    | `demo-admin@tipguard.staging`      | `TipGuardDemo2026!`  | `/admin`                       |

With `VITE_DEMO_MODE=true`, `/login` shows one-click demo role buttons (same emails/password).

## Manual steps

1. Open the login URL above.
2. Enter email + password (or use a demo one-click button on staging).
3. Submit **Continue** → land on the role dashboard (table above).
4. **Refresh** the page → still on the same dashboard (session persisted).
5. **Sign out** → returned to `/login` (or `/`).

## Automated checks (local)

```bash
npm run test:e2e -- e2e/demo-login-dashboard.spec.ts e2e/auth-public-and-guards.spec.ts e2e/boot-startup.spec.ts e2e/merchant-demo-flow.spec.ts
npm run test:auth
```

## Notes

- `SessionIdleWatcher` is enabled in `App.tsx`; optional idle logout uses `VITE_SESSION_IDLE_MINUTES` when set.
- If login fails after seed, re-run `npm run seed:demo` and confirm Supabase auth redirect URLs include your app origin (`npm run auth:configure`).

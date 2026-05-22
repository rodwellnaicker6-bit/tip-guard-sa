# Session security & idle recovery

## Idle sign-out (optional)

| Env var | Effect |
|---------|--------|
| Unset or empty | Idle watcher **off** (default for beta) |
| `0` | Off |
| `30` | Sign out after **30 minutes** without pointer/keyboard/touch/scroll activity |

Set in Vercel Production (and Preview for testing): `VITE_SESSION_IDLE_MINUTES=30`.

Implementation: `SessionIdleWatcher` in `src/App.tsx` under `AuthProvider`; logic in `src/hooks/useSessionIdle.ts`.

## Recovery after timeout

1. User is redirected to signed-out state (same as manual logout).
2. **Admin:** Return to `/login` → sign in with admin account → `/admin`.
3. **Merchant / guard / customer:** `/login` → normal hub route; unsaved form data is lost (no draft persistence).
4. If login fails after timeout, check Supabase Auth status and `VITE_SUPABASE_URL` / anon key on the deployment.
5. For shared devices at a venue, prefer idle timeout **on** for admin tablets; keep **off** on customer tip kiosks unless they use a dedicated guard/merchant session.

## Testing idle (Preview)

1. Set `VITE_SESSION_IDLE_MINUTES=1` on a Preview deployment.
2. Sign in as admin, wait 1 minute without interaction.
3. Confirm redirect to logged-out state and that `/admin` requires login again.

## Post-MVP

- Warning modal 60s before logout
- Server-side session revocation for admin role
- See [PRODUCTION_RISK_REPORT.md](./PRODUCTION_RISK_REPORT.md) P1-7 for server-side admin audit

## Related

- [ADMIN_PROCEDURES.md](./ADMIN_PROCEDURES.md)
- [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)

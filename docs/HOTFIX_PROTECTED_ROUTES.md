# Hotfix: Protected routes landing on `/` or bouncing after DB migrations

## Symptoms

- App builds; Vite preview / prod loads the shell.
- Deep links to `/merchant`, `/guard`, `/customer/dashboard`, etc. feel like they “snap back” to the marketing home (`/`) or never reach the hub.
- Often correlated with slower `getSession()`, profile/merchant reads after RLS or schema changes, or transient `INITIAL_SESSION` behaviour.

## Root causes (file:line — approximate after fix)

### 1. Session cleared on `INITIAL_SESSION` before `getSession()` (AuthProvider)

**Where:** `src/context/AuthProvider.tsx` — `applySession`, `onAuthStateChange`, boot `useEffect`.

**What went wrong:** For `INITIAL_SESSION` with a **null** session, the handler cleared React auth state and sometimes marked the session boot complete **before** the deferred `getSession()` resolved. That produced a window where `sessionReady === true` but `user` / `session` were still null, so guards treated the user as signed out or raced with profile load.

**Fix:** If `event === "INITIAL_SESSION"` and there is no `next?.user?.id`, **return without mutating state** and **defer** `markSessionReady()` until `getSession()` finishes. Authoritative session is applied with `applySession(..., "BOOT_GET_SESSION")`.

**Related:** Removed resetting `sessionSnapshotRef.current = null` at the start of every auth boot effect — that could leave React session populated while the ref was cleared, so a later null event could wipe the session before `getSession()` completed.

**Related:** Transient-null preservation no longer treats `BOOT_GET_SESSION` as a signal to keep a stale session when the server reports no session; `INITIAL_SESSION` is handled by the early return above.

### 2. `RequireAuth` waited on `profileReady` (RequireAuth)

**Where:** `src/components/RequireAuth.tsx` — `RequireAuth` previously required `authReady` (`sessionReady && profileReady`).

**What went wrong:** Any protected route waited for **profiles/guards/merchants** round-trips before rendering. Slow or flaky reads after migrations increased time on the loader or made it easier to misread “stuck on home” when combined with session races.

**Fix:** `RequireAuth` only requires **`sessionReady`** and a hydrated `user` or `session` (with the existing grace window). Role-specific wrappers (`RequireMerchant`, `RequireGuard`, `RequireAdmin`) still wait for **`authReady`** before role redirects so we do not send merchants to `/merchant/setup` while flags are still loading.

### 3. Non-admins hitting `/admin/*` were sent to `/` (RequireAuth)

**Where:** `src/components/RequireAuth.tsx` — `RequireAdmin` used `<Navigate to="/" replace />`.

**What went wrong:** That was the **only** programmatic `<Navigate to="/">` in the tree; it matched the symptom “always home” for anyone who opened admin or had a stale admin bookmark.

**Fix:** Redirect non-admins to `pathAfterSignIn(...)` (onboarding, guard, merchant, or customer hub as appropriate).

### 4. `navigateAfterAuth` sent unconfigured clients to `/` (authRedirect)

**Where:** `src/lib/authRedirect.ts` — `navigateAfterAuth` when `!isSupabaseBrowserConfigured`.

**Fix:** Navigate to **`/login`** instead of `/` so authenticated flows never imply “landing” success.

### 5. Merchant/guard flags dropped on query errors (AuthProvider)

**Where:** `src/context/AuthProvider.tsx` — `loadAccount` after `Promise.all` on `profiles` / `guards` / `merchants`.

**What went wrong:** `hasGuardRow` / `hasMerchantRow` were `!!data && !error`. A **transient** error on one table zeroed flags even when the previous snapshot still knew the user was a merchant/guard.

**Fix:** On `guardRes.error` / `merchRes.error`, **preserve** the last known `hasGuardRow` / `hasMerchantRow` from `accountStateRef` instead of forcing false.

## What we did **not** change

- `MerchantDashboard` / `useMerchantVenue` already avoid `navigate("/")` on missing venue; they link home only as an explicit user action.
- `pathAfterSignIn` already routes incomplete profiles to `/onboarding`; there was no automatic `/` from that helper.

## Manual validation

1. `npm run build && npm run preview` (or `npm run dev`).
2. **Cold load:** While logged in, open `/merchant`, `/guard`, `/customer/dashboard` in a new tab; confirm hubs load (or setup/onboarding) rather than `/`.
3. **Login flow:** Sign in → expect redirect from `usePostAuthRedirect` / `navigateAfterAuth` to the correct hub, not `/`.
4. **Admin:** Sign in as non-admin, visit `/admin` → should redirect to role-appropriate destination, not `/`.
5. **Console:** Watch for `INITIAL_SESSION null — deferring to getSession` and absence of spurious `session cleared` / `RequireAuth` kickouts during a normal refresh.

## Files changed

- `src/context/AuthProvider.tsx`
- `src/components/RequireAuth.tsx`
- `src/lib/authRedirect.ts`
- `docs/HOTFIX_PROTECTED_ROUTES.md`

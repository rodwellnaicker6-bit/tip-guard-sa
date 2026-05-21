# Auth + Supabase local setup (localhost:5173)

## Redirect URLs (Supabase Dashboard)

**Authentication → URL Configuration**

| Setting | Value |
|---------|--------|
| Site URL | `http://localhost:5173` |
| Redirect URLs | `http://localhost:5173/auth/callback` |
| | `http://localhost:5173/auth/reset` |

Signup uses `emailRedirectTo: ${origin}/auth/callback` from `AuthProvider.tsx`.

## Common “Failed to fetch” causes

1. **Wrong `VITE_SUPABASE_URL`** — must match Dashboard → Settings → API → Project URL exactly (typo in project ref = DNS `ENOTFOUND`).
2. **Dev server not restarted** after editing `.env`.
3. **Invalid anon key** — use the project’s **publishable** or **anon** key from the same project as the URL.
4. **Offline / VPN / ad-block** blocking `*.supabase.co`.

## Verify

```bash
npm run env:check:staging
npm run test:auth
npm run verify:supabase
```

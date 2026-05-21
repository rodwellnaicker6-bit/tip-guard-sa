# RLS audit — TipGuard SA

**Audit date:** 20 May 2026  
**Scope:** `supabase/migrations/` + app `RequireAuth` guards

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Core tables (`profiles`, `guards`, `tips`) | OK with caveats | RLS enabled in init; hardened by triggers in `20260209000000_security_critical.sql` |
| Tips writes | OK | Client INSERT/UPDATE/DELETE blocked by `tips_require_privileged_writer` trigger |
| Internal ops (`api_rate_log`, webhook dedupe tables) | OK | RLS on + REVOKE from anon/authenticated |
| `audit_log` (new stub) | OK | RLS on + REVOKE from anon/authenticated |
| `guards` broad SELECT | Caveat | `guards_select_authenticated` allows any signed-in user to read all guard rows — intentional for customer browse; balance fields protected by trigger on UPDATE |
| Admin / merchant tables | Verify live | Run inventory SQL on deployed project after `db push` |

## Policies (from migrations)

### `profiles`
- `profiles_select_own` — SELECT own row
- `profiles_insert_own` — INSERT own row (role forced to `customer` by triggers unless admin/service)
- `profiles_update_own` — UPDATE own row (role change blocked by `profile_prevent_client_role_change`)

### `guards`
- `guards_select_authenticated` — all authenticated users can SELECT (customer discovery)
- `guards_select_public_verified` — anon can SELECT verified guards only
- `guards_insert_own` — INSERT own row with financial defaults in WITH CHECK (`20260209000000`)
- `guards_update_own` — UPDATE own row; sensitive columns blocked by trigger

### `tips`
- `tips_select_guard_or_payer` — payer or owning guard can SELECT
- Writes: server-only via `tips_require_privileged_writer` trigger

### Internal
- `api_rate_log`, `stripe_webhook_events` / Paystack equivalents: no client policies; service_role only

## App-layer guards (not a substitute for RLS)

| Route prefix | Component |
|--------------|-----------|
| `/customer/dashboard`, wallet, history | `RequireAuth` |
| `/guard/*` (except setup) | `RequireAuth` + `RequireGuard` |
| `/merchant/*` (except setup) | `RequireAuth` + `RequireMerchant` |
| `/admin/*` | `RequireAdmin` |

## Recommended SQL verification (on production DB)

```sql
SELECT c.relname, c.relrowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## Post-MVP

- Tighten `guards_select_authenticated` to a security-invoker view exposing only public columns for customers
- Automated RLS tests with JWT fixtures per role
- Document policies for `merchants`, `qr_codes`, `transactions`, `wallets` after each new migration

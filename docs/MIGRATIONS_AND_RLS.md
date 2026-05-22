# Migrations and RLS verification

## Release tag `v2.100.1` (final bundle)

There is **no** migration file named `v2.100.1`. That tag maps to the **latest applied pair** on `main`:

| Timestamp | File | Purpose |
|-----------|------|---------|
| `20260625120000` | `financial_ops.sql` | Financial ops, reconciliation spine |
| `20260625130000` | `fintech_integrity_fixes.sql` | P0 wallet/payout hold fixes (final audit) |

Full chain ends at `20260625130000`. After `supabase db push`, verify RPCs `resolve_tip_target` and `admin_payment_analytics` exist (`npm run verify:supabase`).

## Apply migrations to your Supabase project

From the repo root, with the [Supabase CLI](https://supabase.com/docs/guides/cli) installed:

```bash
# One-time: link local repo to hosted project (ref from Dashboard URL: https://<REF>.supabase.co)
supabase link --project-ref YOUR_PROJECT_REF

# Push pending migrations to the linked remote database
supabase db push
```

To inspect what will run without applying (when supported by your CLI version):

```bash
supabase migration list
```

**Verify:** In Supabase Dashboard → **Database → Migrations**, all files under `supabase/migrations/` should appear in order. Reconcile any “drift” before production (restore from backup or generate repair migration—never guess on prod).

## Role / profile creation (signup)

Expected behaviour (see `20260209000000_security_critical.sql`):

1. `auth.users` insert fires `handle_new_user` → `public.profiles` row with **`role = 'customer'`** always for new signups.
2. `profile_enforce_customer_role_on_insert` blocks non-admin/service from inserting other roles.
3. `profile_prevent_client_role_change` prevents users from changing their own `role`; only `service_role` or `is_admin()` can.
4. After `20260615100000_tipguard_rbac_extension.sql`, trigger `trg_profile_insert_customer` ensures a **`customers`** row exists for each new profile.

**Quick SQL checks** (SQL Editor, as postgres or dashboard):

```sql
-- Recent signups: profile role should be customer unless an admin changed it
select id, role, full_name, created_at
from public.profiles
order by created_at desc
limit 10;

-- Customers mirror (post-RBAC migration)
select count(*) as customer_rows from public.customers;
select count(*) as profile_rows from public.profiles;
-- customer_rows should be >= profiles created since migration + backfill
```

## RLS inventory (run in SQL Editor)

List public tables and whether RLS is enabled:

```sql
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by 1;
```

List policies:

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

**Functional RLS checks** must be run **as each role** (different JWTs). The dashboard SQL editor runs as postgres and **bypasses** RLS—use the app, or `supabase db execute` with a user token, or automated tests.

Suggested manual matrix:

| Table / view | Customer (browser) | Guard | Merchant | Admin |
|--------------|-------------------|-------|----------|-------|
| `profiles` own row | read/update non-role fields | same | same | admin: broader |
| `guards` | own row if guard | own | — | all |
| `tips` | own payer tips | own guard tips | — | audit |
| `merchants` | — | — | own row | all |
| `qr_codes` | — | own guard QR | own merchant QR | all |
| `tip_transactions` (view) | per underlying `tips` RLS | | | |

If any table shows `rls_enabled = false` for user-facing data, treat it as a blocker before go-live.

## Protected routes (app layer)

These are enforced in React (`RequireAuth`, `RequireGuard`, `RequireAdmin`, `RequireMerchant`) **in addition** to RLS. Verify in the browser:

- `/admin` → login if anonymous; home if not admin.
- `/guard`, `/guard/qr`, … → login if anonymous; onboarding if not a guard user.
- `/merchant` → login; `/merchant/setup` if not yet a merchant user.
- `/customer/dashboard` → login if anonymous.

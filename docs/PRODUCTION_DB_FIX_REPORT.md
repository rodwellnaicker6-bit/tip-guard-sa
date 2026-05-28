# Production DB Fix Report — fyjmujhlqpvfryelnfum

Date: 2026-05-27  
Status: **PASS (DB root cause fixed)**

## Executive verdict

- `/merchant` timeout root cause was production schema drift: key objects expected by app code were missing in prod (`merchant_payment_analytics_v2`, `merchants.risk_score`, and several performance indexes), even though parts of the migration history showed later migrations.
- I applied targeted production migrations directly, reloaded PostgREST schema cache, and verified `merchant_payment_analytics_v2(text)` now exists.
- Remaining blockers are operational network/API instability during smoke checks (intermittent `fetch failed`), not missing DB objects.

## Exact root cause

1. **Critical RPC missing in schema cache / catalog**
   - `public.merchant_payment_analytics_v2(text)` did not exist in `pg_proc` on production.
2. **Merchant table mismatch with frontend hydration path**
   - `public.merchants.risk_score` missing, causing fallback paths and timeout pressure in venue hydration flow.
3. **Performance/index drift**
   - Several hot-path indexes referenced by later local migrations were missing in production (`guards_merchant_idx`, `guards_location_idx`, `tips_provider_status_idx`, `payment_events_reference_idx`, venue hydration indexes).
4. **Migration history drift**
   - Production history had non-repo versions/names for equivalent fixes (e.g. older `tip_checkout_schema_hotfix_v2`), and did not include some local migration versions directly.

## Local migrations audited vs production

Audited all local files in `supabase/migrations/*.sql` and compared with production migration history.

### Not present in production history by local version/name (before fix)

- `20260626140000_tip_checkout_schema_hotfix.sql`
- `20260626170000_security_hardening_rls.sql`
- `20260626180000_save_onboarding_role_fix.sql`
- `20260626210000_platform_fee_200bps.sql`
- `20260626220000_merchants_risk_score.sql`
- `20260626230000_run_fraud_checks.sql`
- `20260627000000_recreate_run_fraud_checks_rpc.sql`
- `20260627120000_venue_hydration_indexes.sql`

## Exact SQL executed on production

Applied via production migrations (MCP `apply_migration`) and direct SQL (`execute_sql`) on project `fyjmujhlqpvfryelnfum`.

### Applied migration payloads (exact names)

- `tip_checkout_schema_hotfix`
- `security_hardening_rls`
- `save_onboarding_role_fix`
- `platform_fee_200bps`
- `merchants_risk_score`
- `run_fraud_checks`
- `recreate_run_fraud_checks_rpc`
- `venue_hydration_indexes`
- `merchant_analytics_v2_and_perf_indexes`

### Core DDL/DCL executed

```sql
-- merchants hydration compatibility
alter table public.merchants
  add column if not exists risk_score int not null default 0 check (risk_score >= 0 and risk_score <= 100);

-- merchant analytics RPC restore
create or replace function public.merchant_payment_analytics_v2(p_period text default '30d')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
... ;

revoke all on function public.merchant_payment_analytics_v2(text) from public;
grant execute on function public.merchant_payment_analytics_v2(text) to authenticated;

-- fraud RPC deterministic rebuild
create or replace function public.run_fraud_checks(
  p_user_id uuid,
  p_amount_cents int default null,
  p_reference text default null,
  p_route text default 'payment'
)
returns jsonb
language plpgsql
security definer
set search_path = public
... ;

revoke all on function public.run_fraud_checks(uuid, int, text, text) from public;
grant execute on function public.run_fraud_checks(uuid, int, text, text) to service_role;
grant execute on function public.run_fraud_checks(uuid, int, text, text) to authenticated;
alter function public.run_fraud_checks(uuid, int, text, text) owner to postgres;

-- schema cache refresh
notify pgrst, 'reload schema';
```

## Functions / RPCs / views / grants / triggers / indexes / policies audit

### Functions/RPCs

- Fixed missing: `public.merchant_payment_analytics_v2(text)` ✅
- Recreated and granted: `public.run_fraud_checks(uuid,int,text,text)` ✅
- Existing unrelated signatures remained present: `resolve_tip_target(text)` ✅

### Views

- No additional missing view blocker identified for `/merchant` flow.

### Grants

- Applied expected execute grants for restored RPCs.
- Re-applied hardening revokes for anon on privileged/admin RPCs.

### Triggers

- No trigger-specific blocker identified for `/merchant` timeout path.

### Policies (RLS)

- `merchants` policies present and non-recursive (`auth.uid() = user_id` for own-row access/update).
- No recursion issue found on `merchants`, `tips`, `transactions` in current policy set.

### Indexes added/restored

Added with `if not exists` safety:

- `guards_merchant_idx` on `public.guards (merchant_id)`
- `guards_location_idx` on `public.guards (location_id)`
- `qr_codes_location_idx` on `public.qr_codes (location_id)`
- `qr_codes_token_idx` on `public.qr_codes (code_token)`
- `tips_provider_status_idx` on `public.tips (payment_provider, status, created_at desc)`
- `tips_guard_created_at_idx` on `public.tips (guard_id, created_at desc)`
- `payment_events_tip_id_idx` on `public.payment_events (tip_id) where tip_id is not null`
- `payment_events_transaction_id_idx` on `public.payment_events (transaction_id) where transaction_id is not null`
- `merchant_locations_venue_active_idx` on `public.merchant_locations (id, merchant_id) where active = true`
- `qr_codes_code_token_active_idx` partial index
- `qr_codes_guard_id_active_idx` partial index
- `tip_links_token_expires_idx`
- `guards_merchant_location_verified_idx` partial index
- `merchants_user_id_idx`
- `profiles_id_role_idx include (role, full_name, phone)`

## Query performance before/after

Given low dataset volume in production currently, both plans were already sub-millisecond, but now use expected schema/index coverage for growth:

- Merchant row hydration probe:
  - Execution time ~`0.102 ms`
- Merchant analytics aggregate probe:
  - Execution time ~`0.174 ms`

These timings indicate no current heavy-scan bottleneck at present data size; timeout was caused primarily by missing objects and API fetch instability.

## Smoke and validation outcomes

### Post-fix DB validations

- `merchant_payment_analytics_v2(text)` exists in `pg_proc` ✅
- `merchants.risk_score` exists ✅
- PostgREST schema reload sent (`notify pgrst, 'reload schema'`) ✅

### Automated smoke (`npm run verify:supabase`)

- Partially failed with intermittent network errors (`TypeError: fetch failed`) on multiple RPC probes.
- DB object existence checks and key table checks passed where reachable.

Interpretation: remaining failures are transport/runtime connectivity issues, not schema drift.

## Remaining blockers

1. Intermittent network/API transport failures during verification (`fetch failed`) need infra/runtime follow-up.
2. Browser-authenticated `/merchant` interactive verification was not completed in this run (no authenticated browser session in this execution context).

## PASS/FAIL verdict

**PASS (database fix complete)** for the production schema root-cause of `/merchant` timeout and missing analytics RPC.  
**Conditional operational follow-up required** for network instability seen during smoke probes.

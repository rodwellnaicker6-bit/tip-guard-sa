# Hotfix: `PGRST202` — `public.run_fraud_checks`

## Root cause

Production PostgREST returned **PGRST202** (`Could not find the function public.run_fraud_checks` in the schema cache) during Paystack init/verify. The RPC is defined in `20260625120000_financial_ops.sql`, but that migration (or its function grant) was never applied on the linked project — **schema drift**.

Edge functions called `service.rpc("run_fraud_checks", …)`. When PostgREST could not resolve the RPC, some code paths surfaced errors to clients; combined with aggressive session handling on the frontend, guards saw logout / venue reload failures and frozen payouts.

**Secondary bug (fixed):** An early hotfix file `20260526203545_ensure_run_fraud_checks_rpc.sql` had a timestamp **before** migrations already on prod, so `supabase db push` would **never** run it. Replaced with `20260626230000_run_fraud_checks.sql` (after `20260626220000`).

## Callers (payload contract)

| Caller | Args | Blocks pay? |
|--------|------|-------------|
| `_shared/fraudCheck.ts` | `p_user_id`, `p_amount_cents`, `p_reference`, `p_route` | Never — fail-open + 3s timeout |
| `paystack-initialize` | same via helper | 403 `fraud_blocked` only if `blocked && !rpcUnavailable` |
| `paystack-verify` | same | same |
| `paystack-webhook` | same | never (audit only) |
| `request-payout` | — | **no** fraud RPC |

Function signature: `run_fraud_checks(uuid, int, text, text) returns jsonb`. **GRANT EXECUTE** to `service_role` only (function raises if not service_role).

## Migration diff summary

File: `supabase/migrations/20260626230000_run_fraud_checks.sql`

- `create table if not exists fraud_rules` + seed rules
- `create or replace function public.run_fraud_checks(...)`
- `grant execute ... to service_role`
- `notify pgrst, 'reload schema'`

Idempotent — safe to re-run in SQL editor.

## Exact SQL fix for production

If `db push` is blocked, run the full migration file in Supabase SQL editor, or:

```bash
npm run db:sql -- supabase/migrations/20260626230000_run_fraud_checks.sql
```

Verify:

```sql
select public.run_fraud_checks(
  '00000000-0000-0000-0000-000000000001'::uuid,
  10000,
  'probe_ref',
  'manual'
);
-- expect: {"blocked": false, "triggered": []}  (or triggered rules if limits hit)
```

## Edge graceful degradation (deploy required)

`fraudCheck.ts`:

- 3s timeout on RPC
- Log `[TipGuard:fraud]` with code/message; **fail open** on PGRST202, timeout, or any error
- `paystack-initialize` / `paystack-verify`: no 403 unless real `blocked` with RPC available

Redeploy:

```bash
supabase functions deploy paystack-initialize --project-ref fyjmujhlqpvfryelnfum
supabase functions deploy paystack-verify --project-ref fyjmujhlqpvfryelnfum
supabase functions deploy paystack-webhook --project-ref fyjmujhlqpvfryelnfum
supabase functions deploy request-payout --project-ref fyjmujhlqpvfryelnfum
```

## Frontend stability

- `paymentSession.ts` — never `signOut` on timeout; use cached JWT when valid
- `AuthProvider` / `RequireAuth` — grace period before login redirect; session snapshot on refresh
- `GuardHome` — payout submit debounce (2.5s) + `payoutBusy` guard

Deploy frontend after merge: `vercel --prod` (if bundled with this hotfix).

## Verify locally / CI

```bash
npm run build
npm run lint
npm run verify:supabase   # service_role run_fraud_checks probe
npm run verify:paystack
npm run smoke:production  # needs env + live project
```

## Manual retest

1. Apply migration (`npm run db:push` or SQL editor).
2. Redeploy Edge functions above.
3. Guard: open hub → request payout (should not log out).
4. Customer: QR tip R10 → Paystack test → verify success.
5. Supabase logs: `[TipGuard:fraud]` should be absent or warn-only after migration.

**Retest URL (production):** https://tipguard-sa.vercel.app/guard/home (sign in as guard) and a live QR tip link.

## Production readiness

| Check | Status |
|-------|--------|
| Migration ordered for prod apply | PASS (after commit) |
| Edge fail-open + timeout | PASS (code) |
| Frontend no logout on RPC/timeout | PASS (code) |
| `run_fraud_checks` exists on linked DB | **RUN** `verify:supabase` post-push |
| Edge redeployed | **MANUAL** |

**Overall:** PASS for code + migration path; **FAIL** until `db push`, Edge deploy, and `verify:supabase` green on production.

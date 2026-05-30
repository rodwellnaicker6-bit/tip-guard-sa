# HOTFIX — Tip link unavailable / trip page load failure

**Date:** 2026-05-29  
**Project:** `fyjmujhlqpvfryelnfum`  
**Demo URL:** https://tipguardsa.co.za/tip/demo-staging-qr-01

## Symptoms

- `QrTipLanding` shows **Tip link unavailable** with body text from `qrResolveErrorMessage()` (often *We could not load this tip page…* on timeout/network).
- NFC tap path shows the same after `resolveTipTarget` fails.

## Root cause

**Primary (production):** Active `qr_codes` rows had `expires_at` in the past. `resolve_tip_target` requires `q.expires_at > now()` and `q.revoked_at is null`, so the RPC returned **zero rows** while HTTP 200 — the client treated that as invalid/expired.

**Secondary (client, fixed in `bbdfd52`):** Older client code used `if (!rpcErr && data)` so an empty array `[]` did not surface a clear error before slow fallback paths.

**Not the cause (verified 2026-05-29):** Missing RPC, wrong Supabase project ref, or RLS blocking anon — `resolve_tip_target` is `SECURITY DEFINER` with `grant execute` to `anon`.

## Fix

1. **Database (idempotent):** `supabase/migrations/20260628120000_compliance_demo_reconcile.sql`
   - Re-applies `resolve_tip_target` + `save_onboarding_role`
   - Extends non-revoked codes with past expiry:

```sql
update public.qr_codes
set expires_at = now() + interval '400 days'
where revoked_at is null
  and expires_at <= now();
```

2. **Client:** `src/lib/resolveTipTarget.ts` — treat successful RPC with no row as expired; `[TipGuard:resolve]` console logging for prod diagnosis.

## Verification queries (Supabase SQL editor)

```sql
-- Should return one row for demo token
select * from public.resolve_tip_target('demo-staging-qr-01');

-- Expiry / revoke state
select code_token, expires_at, revoked_at, guard_id, qr_type
from public.qr_codes
where code_token = 'demo-staging-qr-01';
```

**Expected after fix:** `resolve_tip_target` returns `Nomsa Demo`; `expires_at` > `now()`.

## CLI probes

```bash
npx tsx scripts/probe-resolve.ts demo-staging-qr-01
npm run verify:supabase
npx tsx scripts/stress-qr-resolve.ts demo-staging-qr-01 5
```

## Browser

1. Open https://tipguardsa.co.za/tip/demo-staging-qr-01 (incognito OK).
2. Expect **Tip Nomsa Demo** and amount presets within ~10s.
3. DevTools → Console: `[TipGuard:resolve] rpc ok` with `guardId`.

## Deploy

```bash
npm run db:push   # or paste migration SQL in Dashboard
npm run build
git push origin main   # Vercel production
```

Confirm Vercel `VITE_SUPABASE_URL` = `https://fyjmujhlqpvfryelnfum.supabase.co` (not typo `fyjumjhlqpvfryelnfum`).

## Error string map

| User-facing | Source |
|-------------|--------|
| Tip link unavailable | `QrTipLanding.tsx` heading when `error \|\| !target` |
| We could not load this tip page… | `userFacingErrors.ts` `qrResolveErrorMessage` (timeout/network) |
| This tip link is not available right now… | `qrResolveErrorMessage` (invalid/expired/not verified) |

## Related

- [COMPLIANCE_DEMO_STABILIZATION.md](./COMPLIANCE_DEMO_STABILIZATION.md)
- [HOTFIX_QR_AUTH_KICKOUT.md](./HOTFIX_QR_AUTH_KICKOUT.md)

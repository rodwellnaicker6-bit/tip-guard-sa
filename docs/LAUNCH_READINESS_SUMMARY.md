# Launch readiness summary

**Date:** 2026-05-21  
**Branch:** `main`  
**Supabase project:** `fyjmujhlqpvfryelnfum`

## RPC / database

| Check | Status |
|-------|--------|
| `resolve_tip_target` on remote | Deployed (`20260625140000_payment_qr_rpc_hotfix.sql`) |
| `admin_payment_analytics` on remote | Deployed (same hotfix) |
| `npm run verify:supabase` | Pass |
| Full `supabase db push` | Blocked — remote schema predates local migration history; use hotfix SQL or repair + incremental push |

## App quality gates

| Check | Status |
|-------|--------|
| `npm run test:auth` | Pass |
| `npm run build` | Pass |
| `npm run lint` | Pass |

## Launch ready?

**Staging / pilot:** Yes for tip QR resolution and admin analytics RPCs.  
**Production:** No — see [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md) (payout settlement, Paystack live keys, cron wiring).

## Operator note

If RPCs are missing on another environment, run in Supabase SQL Editor:

`supabase/migrations/20260625140000_payment_qr_rpc_hotfix.sql`

Or: `npx supabase db query --linked -f supabase/migrations/20260625140000_payment_qr_rpc_hotfix.sql`

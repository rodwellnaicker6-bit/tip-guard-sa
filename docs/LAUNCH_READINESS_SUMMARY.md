# Launch readiness summary

**Date:** 2026-05-21  
**Branch:** `main`  
**Supabase project:** `fyjmujhlqpvfryelnfum`

## RPC / database

| Check | Status |
|-------|--------|
| `resolve_tip_target` (expiry + merchant verified) | `20260625160000_launch_qr_hardening.sql` |
| `claim_tip_link_session` anti-replay | Same migration (service_role from `paystack-initialize`) |
| `admin_payment_analytics` | `20260625140000_payment_qr_rpc_hotfix.sql` |
| `npm run verify:supabase` | Run before deploy |
| Full `supabase db push` | May fail on diverged history — apply hotfix + launch SQL on remote |

## App quality gates

| Check | Status |
|-------|--------|
| `npm run test:auth` | Pass (prior pass) |
| `npm run build` | Run before deploy |
| `npm run lint` | Run before deploy |
| `npm run verify:paystack` | Run before deploy |
| E2E (`npm run test:e2e`) | Optional smoke |

## Launch ready?

**Staging / pilot:** Yes — QR hardening, payment stack audit, payout schedule UI, CSV export, cron docs.  
**Production:** Conditional — schedule crons, apply `20260625160000`, live Paystack keys; see [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md).

## Operator note

Apply on remote (in order if missing):

1. `supabase/migrations/20260625140000_payment_qr_rpc_hotfix.sql`
2. `supabase/migrations/20260625160000_launch_qr_hardening.sql`

Or: `npx supabase db query --linked -f <file>`

See [LAUNCH_SUMMARY_REPORT.md](./LAUNCH_SUMMARY_REPORT.md) for the one-pager.

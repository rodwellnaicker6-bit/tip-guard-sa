# Remaining blockers

## Resolved (2026-05-21)

- ~~Remote Supabase DB: `resolve_tip_target` RPC not deployed~~ — applied via `20260625140000_payment_qr_rpc_hotfix.sql`
- ~~Remote Supabase DB: `admin_payment_analytics` RPC not deployed~~ — same hotfix (`admin_payment_analytics_v2` not used; client and verify use `admin_payment_analytics`)
- ~~Remote: QR hardening core (`expires_at`, `claim_tip_link_session`, hardened `resolve_tip_target`)~~ — partial apply on `fyjmujhlqpvfryelnfum` (full file needs `payment_events` table)

## Database / migrations

- Full `supabase db push` still fails on this project when replaying `20250512000000_init.sql` (policies already exist). Remote migration history may list only hotfix versions; new environments should run hotfix + launch SQL per [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md). `npm run verify:supabase` now fails if `20260625160000` is missing.

## Product / ops

- Remote `fyjmujhlqpvfryelnfum` lacks `payment_events` — full `20260625160000` QR scan audit (`touch_qr_code` → `tipguard` events) pending that table/migration chain

- P1-1: Admin manual payout status does not call settle/release RPCs
- P1-4: Payout state machine not enforced in SQL
- P1-5: Reconciliation is aggregate-only, not reference-level Paystack match
- P1-6: `request-payout` does not initiate Paystack transfer API
- P2-4: Cron jobs (`process-webhook-retries`, `reconcile-daily`) not scheduled in Dashboard
- P2-5: `notify-payment` not wired from settlement hooks
- Live Paystack: `pk_live_` / `sk_live_` not validated in this pass (test keys only)

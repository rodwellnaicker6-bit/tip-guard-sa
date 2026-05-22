# Remaining blockers

- Remote Supabase DB: `resolve_tip_target` RPC not deployed — run `supabase db push`
- Remote Supabase DB: `admin_payment_analytics` RPC not deployed — run `supabase db push`
- P1-1: Admin manual payout status does not call settle/release RPCs
- P1-4: Payout state machine not enforced in SQL
- P1-5: Reconciliation is aggregate-only, not reference-level Paystack match
- P1-6: `request-payout` does not initiate Paystack transfer API
- P2-4: Cron jobs (`process-webhook-retries`, `reconcile-daily`) not scheduled in Dashboard
- P2-5: `notify-payment` not wired from settlement hooks
- Live Paystack: `pk_live_` / `sk_live_` not validated in this pass (test keys only)

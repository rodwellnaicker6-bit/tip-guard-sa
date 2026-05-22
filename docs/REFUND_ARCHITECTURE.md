# Refund & cancel architecture (scaffold)

## Status

Post-MVP. Paystack refunds are operator-initiated; TipGuard records state in `payment_events` only.

## `payment_events.status`

| Status | Meaning |
|--------|---------|
| `received` | Webhook or init logged, not finalized |
| `processed` | Handled successfully |
| `failed` | Terminal failure |
| `refunded` | Paystack refund confirmed (manual Edge job) |
| `cancelled` | Checkout abandoned / void before settlement |

Migration `20260625170000_merchant_ops_launch.sql` extends the status check constraint.

## Planned flow

1. Admin or merchant dispute → operator opens Paystack dashboard refund.
2. Edge `paystack-webhook` receives `refund.processed` (future handler).
3. Service role updates `tips.status = refunded`, `transactions.status = refunded`, wallet reversal RPC.
4. `payment_events` row with `status = refunded`, `event_type = refund.processed`.

## Idempotency

Use `provider_event_id` = `refund:{paystack_ref}:{refund_id}` with `ON CONFLICT DO NOTHING`.

## Not in scope for pilot

- Customer self-service refund UI
- Partial refunds split across guard/merchant ledger

See `docs/RECONCILIATION.md` for settlement matching before refunds.

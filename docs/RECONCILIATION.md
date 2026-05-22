# Transaction reconciliation

## Tables

| Table | Role |
|-------|------|
| `payment_events` | Authoritative provider audit (webhook + init) |
| `transactions` | User-facing ledger rows |
| `reconciliation_log` | Batch run summary (admin-readable) |

## Edge functions

**Daily (date range):** `reconcile-daily`

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/reconcile-daily" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from_date":"2026-05-20","to_date":"2026-05-20"}'
```

**Rolling 24h:** `paystack-reconcile`

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/paystack-reconcile" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Compares counts in the window:

- `payment_events` where `status = 'processed'`
- `transactions` where `status = 'succeeded'`

Writes one `reconciliation_log` row with `matched_count`, `mismatch_count`, and `details` JSON.

**Suggested cron:** daily 02:00 SAST.

## Admin UI

`/admin/transactions` includes a **Reconciliation** section listing recent `reconciliation_log` rows.

## Payout reconciliation report

```sql
select public.payout_reconciliation_report(current_date);
-- Or export JSON in Admin → Transactions (today's report panel).
```

## Manual SQL (support)

```sql
-- Mismatched references (sample): succeeded tx without processed event
select t.paystack_reference, t.status, t.created_at
from public.transactions t
left join public.payment_events pe
  on pe.paystack_reference = t.paystack_reference and pe.status = 'processed'
where t.status = 'succeeded'
  and t.paystack_reference is not null
  and pe.id is null
  and t.created_at > now() - interval '7 days'
limit 50;
```

## Post-MVP

Full Paystack export CSV match: see `src/payments/reconciliation.ts`.

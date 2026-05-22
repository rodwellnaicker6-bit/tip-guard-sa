# Webhook retry queue

Failed Paystack webhook **claims** are enqueued in `public.webhook_retry_queue` (service role only; no client access).

## When rows are created

`paystack-webhook` inserts on `claim_paystack_webhook_event` / `claim_provider_webhook_event` failure (HTTP 500 to Paystack so Paystack retries too).

## Schema (summary)

| Column | Purpose |
|--------|---------|
| `event_id`, `event_type` | Dedupe key (`event:dataId`) |
| `payload` | Full webhook JSON |
| `attempts`, `max_attempts` | Default max 5 |
| `status` | `pending` → `processing` → `pending` (stub) or `failed` |
| `next_retry_at` | Exponential backoff schedule |

## Processor (cron-ready stub)

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/process-webhook-retries" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Current behaviour: reschedules rows with backoff; full replay into `paystack-webhook` is post-MVP.

**Suggested cron:** every 15 minutes (Supabase Cron or external worker).

## Operator queries

```sql
-- Pending retries
select id, event_id, event_type, attempts, next_retry_at, error_message
from public.webhook_retry_queue
where status = 'pending'
order by next_retry_at;

-- Failed after max attempts
select * from public.webhook_retry_queue where status = 'failed' order by updated_at desc limit 20;
```

## Related

- [MONITORING.md](./MONITORING.md)
- [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)

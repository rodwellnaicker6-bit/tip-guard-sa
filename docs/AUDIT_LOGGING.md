# Audit logging verification (beta)

Two trails: **`payment_events`** (money/provider) and **`admin_audit_log`** (operator actions). Payout status via RPC writes both wallet effect and admin audit.

## payment_events

```sql
-- Last 50 events
select id, provider, provider_event_id, event_type, status, paystack_reference, created_at
from public.payment_events
order by created_at desc
limit 50;

-- One tip reference (init, verify, webhook)
select provider_event_id, event_type, status, created_at
from public.payment_events
where paystack_reference = '<reference>'
   or provider_event_id ilike '%<reference>%'
order by created_at;

-- Duplicate webhook claims (expect 0 rows)
select provider, provider_event_id, count(*)
from public.payment_events
where provider = 'paystack'
group by 1, 2
having count(*) > 1;
```

**Writers (code):** `paystack-initialize`, `paystack-verify`, `paystack-webhook`, QR scan (`touch_qr_code` / tipguard provider).

## admin_audit_log

```sql
-- Recent admin actions
select action, entity_type, entity_id, metadata, actor_id, created_at
from public.admin_audit_log
order by created_at desc
limit 50;

-- Payout status changes (RPC action payout_status)
select *
from public.admin_audit_log
where action = 'payout_status'
order by created_at desc
limit 20;

-- Guard / freeze / dispute
select action, entity_id, metadata, created_at
from public.admin_audit_log
where action in ('guard_approve', 'guard_reject', 'guard_flag', 'payouts_freeze_toggle', 'dispute_resolve')
order by created_at desc
limit 30;
```

**Server-side (RPC):** `admin_update_payout_status` → `log_admin_audit('payout_status', …)`.

**Client-side (`logAdminAction`):** `AdminDashboard` — guard approve/reject/flag, payout freeze; `AdminFraud` — dispute resolve. Malicious admin could skip client calls; payout path is safe via RPC.

## Payout status changes

| Path | Logs to |
|------|---------|
| `/admin` Payouts buttons | `admin_audit_log` via RPC |
| `transfer.success` webhook | `payment_events` + direct status update (no admin actor) |
| `transfer.failed` | `schedule_payout_retry` / `release_guard_payout_hold` (service_role) |

## Verification grep (repo)

Run after changes:

```bash
rg -l 'payout_requests|admin_update_payout|settle_guard|release_guard' src supabase/functions
rg -l 'payment_events|log_admin_audit|logAdminAction' src supabase/functions
```

Expected: no `payout_requests.update` in `src/` except webhook retry queue in `AdminFraud`.

## Gaps (known, post-beta)

- `audit_log` table stub not wired from Edge ([AUDIT_LOG.md](./AUDIT_LOG.md))
- Webhook payout `paid` without `admin_audit_log` row — use `payment_events` + `payout_requests` for forensics
- Guard approve: client audit only — consider admin RPC in Phase 2

## Related

- [OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md)
- [MONITORING.md](./MONITORING.md)

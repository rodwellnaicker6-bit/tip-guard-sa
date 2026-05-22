# Operator payout procedures (TipGuard SA)

**Audience:** On-call operator with admin access (`/admin`).  
**RPC:** All payout status changes go through `admin_update_payout_status` — never update `payout_requests.status` directly in SQL unless recovering from a documented incident.

## State machine

| From | To | Wallet effect | Who |
|------|-----|---------------|-----|
| `pending` | `processing` | None (hold already taken at `request-payout`) | Admin → Payouts tab |
| `processing` | `paid` | `settle_guard_payout_hold` — reduces `pending_cents` | Admin or Paystack `transfer.success` webhook |
| `pending` / `processing` | `rejected` | `release_guard_payout_hold` — pending → available | Admin |
| `processing` | `failed` | `release_guard_payout_hold` | Admin or webhook retry exhaustion |

Server implementation: migration `20260625200000_launch_cron_admin_payout.sql`.

## Standard paid flow (beta)

1. Guard requests payout on dashboard (`request-payout` Edge) → row `pending`, funds in `wallet_accounts.pending_cents`.
2. Operator initiates Paystack transfer (external) and records `provider_reference` when wired.
3. Paystack sends `transfer.success` → webhook calls `settle_guard_payout_hold` and sets `paid`, **or** operator marks **Processing** then **Paid** on `/admin` → Payouts (same settle via RPC).
4. Confirm in SQL:

```sql
select id, status, amount_cents, provider_reference, updated_at
from public.payout_requests
where id = '<payout_id>';

select action, metadata, created_at
from public.admin_audit_log
where entity_type = 'payout_requests' and entity_id = '<payout_id>'
order by created_at desc;
```

## Reject / fail flow

1. `/admin` → Payouts → **Rejected** or **Failed** on a `pending` or `processing` row.
2. RPC runs `release_guard_payout_hold`; guard `available_cents` and `balance_cents` restored.
3. If RPC returns `release_hold_failed`, stop — inspect wallet pending vs payout amount ([RECONCILIATION.md](./RECONCILIATION.md)).

## Freeze payouts

- `/admin` → **Freeze payouts** toggles `platform_settings.payouts_frozen`.
- `request-payout` returns 503 while frozen.
- Audit: client `log_admin_audit` action `payouts_freeze_toggle` (also visible in Activity tab).

## Webhook vs admin

| Path | Settles hold | Audit |
|------|--------------|-------|
| `admin_update_payout_status('paid')` | Yes | `admin_audit_log` via `log_admin_audit` inside RPC |
| `paystack-webhook` `transfer.success` | Yes (`settle_guard_payout_hold`) | `payment_events` only; no admin actor |

If both fire, settle is idempotent when status is already `paid`.

## Do not use `/admin/transactions` for status changes

That page runs `payout_reconciliation_report` and `reconcile-daily` only. Payout actions: **Admin home → Payouts tab**.

## Incident

Duplicate settle suspicion → [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) SEV2, freeze payouts, export `payout_requests` + `wallet_accounts` for affected `guard_id`.

## Related

- [ADMIN_PROCEDURES.md](./ADMIN_PROCEDURES.md)
- [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md) — payout reliability test
- `scripts/operator-e2e-checklist.sh` section 4

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

## Automatic Paystack Transfer API

When `PAYSTACK_SECRET_KEY` is set in Supabase Edge secrets and `PAYSTACK_PAYOUT_TRANSFERS` is not `false`:

1. Guard calls `request-payout` with optional `bank_code`, `account_number`, `account_name` (or values stored on `guards.payout_*` columns).
2. Edge creates a Paystack **transfer recipient** (if needed), then **transfer** from balance; row moves to `processing` with `provider_reference` = Paystack `transfer_code`.
3. `transfer.success` webhook settles the hold and sets `paid`.

If the secret is missing, transfers are disabled, or bank details are absent, the payout stays `pending` with a graceful message — operator completes manually (below).

Set `PAYSTACK_PAYOUT_TRANSFERS=false` to force manual-only payouts while keeping card checkout live.

## Standard paid flow (manual or after transfer)

1. Guard requests payout on dashboard (`request-payout` Edge) → row `pending` (or `processing` if Transfer API ran), funds in `wallet_accounts.pending_cents`.
2. If manual: operator initiates Paystack transfer in Dashboard and records `provider_reference` on the row, or marks status on `/admin` → Payouts.
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

## Manual payout test (Paystack review / staging)

1. `npm run seed:demo` — guard balance seeded.
2. Sign in as `demo-guard@tipguard.staging` → **Request payout** (e.g. R50).
3. Sign in as `demo-admin@tipguard.staging` → `/admin` → Payouts → **Processing** → **Paid**.
4. Confirm guard `pending_cents` decreased and payout row `paid` (SQL snippet above).
5. Optional Transfer API: set guard bank fields + `PAYSTACK_SECRET_KEY`, repeat; watch `transfer.success` in webhook logs.

E2E scaffold: `e2e/payout-flow.spec.ts` (set `E2E_SKIP_PAYOUT_TRANSFER=1` when Transfer API unavailable in CI).

## Related

- [ADMIN_PROCEDURES.md](./ADMIN_PROCEDURES.md)
- [PAYSTACK_REVIEW_DEMO.md](./PAYSTACK_REVIEW_DEMO.md)
- [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md) — payout reliability test
- `scripts/operator-e2e-checklist.sh` section 4

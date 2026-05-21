# Audit log (structure)

Table: `public.audit_log` (migration `20260520120000_audit_log_stub.sql`)

## Fields

| Column | Purpose |
|--------|---------|
| `actor_id` | `auth.users.id` when known |
| `action` | e.g. `admin.role_change`, `payout.request`, `webhook.charge.success` |
| `entity_type` | `tip`, `guard`, `merchant`, `transaction` |
| `entity_id` | UUID or external reference |
| `metadata` | JSON context (no PAN, no secrets) |
| `created_at` | Event time |

## Access

- **Insert:** Edge Functions with `service_role` only
- **Read:** Post-MVP admin dashboard or Supabase Studio as postgres
- **Client:** REVOKE — no PostgREST access for anon/authenticated

## Post-MVP wiring

1. Helper in `supabase/functions/_shared/audit.ts` (to be added)
2. Call from `paystack-webhook`, `request-payout`, admin RPCs
3. Retention policy (e.g. 24 months) per POPIA

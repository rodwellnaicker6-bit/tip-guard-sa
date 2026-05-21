# KYC / verification — TipGuard SA

## Current schema (migrations applied)

| Entity | Field / table | Client UI |
|--------|----------------|-----------|
| Guard | `guards.verified` (boolean, operator-set) | `GuardProfile`, `GuardHome`, `VerificationStatusBadge` |
| Merchant | `merchants.verified` (boolean) | `MerchantDashboard` |
| Both | `kyc_cases` (`party_type`, `party_id`, `status`) | `MerchantKyc` (full flow), `GuardProfile` (read status) |

### `kyc_cases.status` values

- `draft` — editable self-attestation
- `submitted` / `in_review` — awaiting operator
- `approved` / `rejected` — terminal states

## If columns are missing

Run migrations through `20260621100000_ecosystem_scaling_core.sql` (creates `kyc_cases`) and `20260209000000_security_critical.sql` (blocks client `verified` updates).

Optional future column (not required for current UI):

```sql
-- alter table public.guards add column if not exists verification_status text
--   check (verification_status in ('pending','approved','rejected'))
--   default 'pending';
```

Until added, the app maps `guards.verified` → approved/pending in `VerificationStatusBadge`.

## Operator workflow

1. Merchant submits `/merchant/kyc` → `kyc_cases.status = submitted`
2. Admin reviews in Supabase dashboard or admin tools (post-MVP)
3. Set `merchants.verified = true` and/or `guards.verified = true` via service role

Clients cannot set `verified` flags (trigger `guard_prevent_client_sensitive_update`).

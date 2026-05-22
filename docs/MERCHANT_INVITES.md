# Merchant staff invites (scaffold)

## Table

`merchant_invites` (migration `20260625170000_merchant_ops_launch.sql`):

- `merchant_id`, `email`, `role` (`staff` | `manager`)
- `token_hash` — store SHA-256 of invite token, never raw token in DB
- `expires_at`, `accepted_at`

RLS: merchant owner or admin.

## Post-MVP activation

1. Merchant UI: invite email → Edge function creates row + sends link `/invite/:token`.
2. Accept flow: user signs up / logs in → RPC marks `accepted_at`, links profile to merchant staff role.
3. Until then: add guards manually via `/merchant/guards` and guard self-setup.

## Security

- One-time tokens, 7-day expiry default
- Rate-limit invite creation per merchant

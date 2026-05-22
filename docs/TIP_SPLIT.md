# Tip split (venue vs guard)

## Platform default

`get_platform_fee_bps()` (RPC) returns platform commission basis points used in `paystack-initialize` when creating pending tips.

## Merchant override

`merchants.tip_split_bps` (nullable, 0–10000):

- `null` — use platform default only (commission to TipGuard; net to guard wallet per existing settlement RPCs).
- Non-null — reserved for post-MVP split between venue pool and guard; **not applied in checkout yet**.

Document venue-specific splits in merchant contracts before enabling in SQL/RPC.

## Related

- `docs/MONETIZATION_MODEL.md`
- Migration `20260625170000_merchant_ops_launch.sql`

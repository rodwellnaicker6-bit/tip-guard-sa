# Printable QR kit

## Merchant UI

1. `/merchant/qr` — create QR, **Print card** (PNG via `renderQrPrintCard` in `src/lib/qrBranding.ts`, same CSS approach as `/guard/qr`).
2. `/merchant/qr/print?token=…&label=…&amount=…` — minimal white HTML for browser **Print** (A6/A7 card).

## Dynamic amount URLs

- Fixed preset: `/tip/{token}?amount=50` (ZAR, 1–5000)
- `dynamic_amount` QR type sets default from `qr_codes.default_amount_cents`

## Types

| `qr_type` | Use |
|-----------|-----|
| `merchant_permanent` | Venue entry; resolves to first verified guard |
| `location_table` | Table/zone + optional location |
| `guard_staff` | Named guard |
| `dynamic_amount` | Default amount on landing |

## Regenerate / revoke

- **Revoke** — sets `revoked_at` (stops resolve)
- **Regenerate** — RPC `regenerate_qr_code_token` revokes old row and inserts successor

## Print CSS

Guard print styles: `GuardQR` page + `qrBranding.ts`. Merchant print page uses `@media print` in `MerchantQrPrint.tsx`.

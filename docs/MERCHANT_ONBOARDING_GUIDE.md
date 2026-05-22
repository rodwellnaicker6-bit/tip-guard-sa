# Merchant onboarding guide

## In-app wizard (`/merchant/setup`)

1. **Venue** — Creates `merchants` row + draft `kyc_cases`.
2. **Locations** — Optional `merchant_locations` (skip allowed).
3. **QR** — Creates `merchant_permanent` QR → `/merchant/qr`.

## After wizard

| Step | Route | Notes |
|------|-------|-------|
| KYC | `/merchant/kyc` | Submit for operator review |
| Guards | `/merchant/guards` | Link staff profiles |
| QR manager | `/merchant/qr` | Types, regenerate, revoke, print |
| Locations | `/merchant/locations` | Multi-branch CRUD |
| Payouts | `/merchant` dashboard | `PayoutSchedulePanel` |

## Operator checklist

- [ ] Merchant `verified = true` after KYC
- [ ] At least one verified guard for staff/table QRs
- [ ] Paystack live keys on production
- [ ] Run `npm run seed:demo` on staging only

## Demo

See [DEMO_ENVIRONMENT.md](./DEMO_ENVIRONMENT.md).

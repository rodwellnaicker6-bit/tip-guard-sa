# Merchant onboarding guide

Controlled beta: max **10** verified merchants in Phase 1 — see [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md).

## In-app wizard (`/merchant/setup`)

| Step | Label | Action |
|------|-------|--------|
| 1 | **Venue profile** | Business name + region; creates `merchants` + draft `kyc_cases` |
| 2 | **Sites & branches** | Optional `merchant_locations` (skip allowed) |
| 3 | **Payment QR** | Creates `merchant_permanent` QR → redirects to `/merchant/qr` |

Copy is production-facing (no staging or env setup in the wizard).

## After wizard

| Step | Route | Notes |
|------|-------|-------|
| KYC | `/merchant/kyc` | Submit for operator review |
| Guards | `/merchant/guards` | Link staff profiles |
| QR manager | `/merchant/qr` | Types, regenerate, revoke, print |
| Locations | `/merchant/locations` | Multi-branch CRUD |
| Payouts | `/merchant` dashboard | `PayoutSchedulePanel` |

## Operator checklist

- [ ] Merchant count within beta cap before approving KYC
- [ ] Merchant `verified = true` after KYC review
- [ ] At least one verified guard for staff/table QRs
- [ ] Paystack **live** keys on production before live tips ([BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md#live-key-rollout-safety-pk_test--pk_live))
- [ ] Staff invites: manual via guards until [MERCHANT_INVITES.md](./MERCHANT_INVITES.md) is active

## Demo / internal testing

See [DEMO_ENVIRONMENT.md](./DEMO_ENVIRONMENT.md) — demo seed is for internal environments only, not merchant-facing copy.

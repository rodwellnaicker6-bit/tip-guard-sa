# Phase 0 merchant pack — Durban (invite-only)

**Phase:** 0 pilot — 1–2 venues, `pk_test_` or first `pk_live_` smoke only.  
**Rule:** Invite-only; operator-led setup ([BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)).

## 1. Invite flow

1. Operator identifies venue (Durban / KZN, signed pilot agreement).
2. Create Supabase Auth user (email) or send register link with pre-agreed email.
3. Assign **merchant** role in `profiles` / onboarding path.
4. Optional: record row in `merchant_invites` when Edge invite ships ([MERCHANT_INVITES.md](./MERCHANT_INVITES.md)).
5. Send merchant:
   - Production URL: `https://<your-vercel-domain>/`
   - Login instructions
   - Support contacts (template below)

## 2. Merchant setup steps

1. `/merchant/setup` — business name, contact, legal acceptance.
2. `/merchant/kyc` — upload/docs per [KYC_VERIFICATION.md](./KYC_VERIFICATION.md).
3. Operator: `/admin` → Guards/Merchants — set merchant `verified = true` after KYC review.
4. `/merchant/locations` — add site(s).
5. `/merchant/guards` — link or invite guards; guard completes `/guard/setup`.
6. Operator: approve guards on `/admin` → Guards tab.

## 3. QR print

1. `/merchant/qr` — generate table/staff QR.
2. `/merchant/qr/print` — print kit ([PRINTABLE_QR_KIT.md](./PRINTABLE_QR_KIT.md)).
3. Physical QR at point of service; test scan before go-live.

## 4. Test tip (staging or live smoke)

| Mode | Steps |
|------|--------|
| Test keys | Scan QR → R10 tip → Paystack test card → success page |
| Live smoke | After [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md) — one **R10** real tip, confirm `transactions.succeeded` + guard wallet |

Operator verifies reference in [AUDIT_LOGGING.md](./AUDIT_LOGGING.md).

## 5. Support contacts template

Copy to merchant welcome email:

```
TipGuard SA — Pilot support (Durban)

Technical / payouts: <operator-email> · <phone>
Hours: Mon–Sat 08:00–18:00 SAST
Emergency (payments down): <on-call-phone>

Merchant hub: https://<domain>/merchant
Guard hub: https://<domain>/guard
Customer help: <support-email>

POPIA / data: <privacy-contact>
```

## 6. Exit Phase 0

- 7 days: 0 SEV1; webhook DLQ = 0; payout smoke passed ([OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md)).
- Then: [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md) if still on test keys.

## Related

- [MERCHANT_ONBOARDING_GUIDE.md](./MERCHANT_ONBOARDING_GUIDE.md)
- [BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md)

# Compliance demo stabilization

Production reliability pass for onboarding, QR resolve, and merchant payments. No new product features.

**Last verified:** 2026-05-28  
**Prod Supabase:** `fyjmujhlqpvfryelnfum` (`npm run verify:supabase` — all checks passed after reconcile migration)

## Summary matrix

| Area | Status | Notes |
|------|--------|-------|
| DB migrations vs client | **PASS** | `20260628120000_compliance_demo_reconcile.sql` idempotently re-applies `save_onboarding_role`, `resolve_tip_target`, extends active `expires_at` |
| Onboarding role save | **PASS** | RPC-first; user-facing errors via `onboardingErrorMessage`; logs gated |
| QR resolve (active codes) | **PASS** | Early exit on empty RPC (no slow fallback); expired-but-not-revoked rows extended in DB |
| QR/payment freeze | **PASS** | `withOperationTimeout` + `try/finally` on pay; `waitForStableSession` before checkout (`14db3f9`) |
| Production UI noise | **PASS** | `VITE_COMPLIANCE_DEMO_MODE` hides Paystack test banner + build badge; `stabilLog` / onboarding logs gated |
| Merchant dashboard refresh | **PASS** | `useMerchantVenue` timeout + cache; `RequireAuth` session grace |

## Deploy checklist

1. **Database** (non-destructive):
   ```bash
   npm run db:push
   ```
   Or apply `supabase/migrations/20260628120000_compliance_demo_reconcile.sql` in Supabase SQL editor.

2. **Vercel env** (compliance demo polish):
   - `VITE_COMPLIANCE_DEMO_MODE=true` — hides Paystack test banner and `build:*` fingerprint
   - Keep `VITE_PAYSTACK_PUBLIC_KEY=pk_test_…` for simulated charges
   - Do **not** set `VITE_TIPGUARD_VERBOSE=true` on production demo

3. **Build & deploy:**
   ```bash
   npm run build && npm run lint
   git push origin main
   ```
   Vercel deploys from `main` when connected.

## Demo flow test steps

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in (demo merchant or new account) | Session restores without infinite spinner |
| 2 | `/onboarding` → pick **merchant** → Continue | Role saves; no migration/SQL text in UI |
| 3 | `/merchant/setup` or existing venue → `/merchant/qr` | Create QR; link copies |
| 4 | Open `/tip/{token}` (incognito OK) | Tip page loads &lt;10s; no false “expired” for active code |
| 5 | Tap **Pay** (signed in) | Paystack test checkout opens after brief session check |
| 6 | Complete test payment | Success route; transaction visible on `/merchant` after refresh |

### Demo credentials (staging seed)

- Merchant: `demo-merchant@tipguard.staging` / `TipGuardDemo2026!`
- Demo QR token: `demo-staging-qr-01` → `/tip/demo-staging-qr-01`

## Manual verification commands

```bash
npm run verify:supabase
npm run stress:qr          # optional: resolve_tip_target latency
npm run test:e2e -- e2e/merchant-demo-flow.spec.ts
```

## Code touchpoints

| Concern | Files |
|---------|--------|
| Role RPC | `Onboarding.tsx`, `save_onboarding_role` migration |
| QR resolve | `resolveTipTarget.ts`, `QrTipLanding.tsx`, `resolve_tip_target` RPC |
| Pay session | `qrAuthSession.ts`, `QrTipLanding.tsx`, `paymentSession.ts`, `paystackCore.ts` |
| UI gating | `complianceDemo.ts`, `PaystackTestBanner.tsx`, `userFacingErrors.ts`, `stabilLog.ts` |

## FAIL criteria (block demo)

- `verify:supabase` reports missing `resolve_tip_target` or `save_onboarding_role`
- Active non-revoked QR returns “invalid/expired” with warm network
- Onboarding shows raw PostgREST/SQL errors
- Pay button spins &gt;18s with no overlay or error

## Related docs

- [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
- [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md)
- [HOTFIX_QR_PAYMENT_TIMING.md](./HOTFIX_QR_PAYMENT_TIMING.md)

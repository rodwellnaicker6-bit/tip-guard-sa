## TipGuard SA — Smoothness checklist (final)

Date: 2026-05-26  
Prod: `https://tipguardsa.co.za`  
Target gitSha: `582379a`

### Automated gates

- **lint**: PASS
- **build**: PASS
- **readiness**: PASS (10/10)
- **verify:supabase**: PASS
- **verify:paystack**: PASS (note: first run was flaky; rerun with `--verbose` passed)
- **smoke:production**: PASS
- **soak script** (`scripts/soak-production.ts`, 40 iterations, token `demo-staging-qr-01`):
  - **resolve_tip_target**: p50 ~256ms, p95 ~341ms, max ~446ms, errors 0/40
  - **list_public_guards**: p50 ~239ms, p95 ~308ms, errors 0/20

### Browser smoke (production)

- **Landing** (`https://tipguardsa.co.za/`): PASS
- **Login page loads** (`https://tipguardsa.co.za/login`): PASS
- **Tip QR landing** (`https://tipguardsa.co.za/qr/demo-staging-qr-01`): PASS (amount picker works; pay CTA disabled when signed out is expected)
- **Tip page** (`https://tipguardsa.co.za/tip/demo-staging-qr-01`): PASS (same UI as QR landing)
- **Merchant demo sign-in** (`/login` → Merchant demo → Continue): PASS
- **Merchant dashboard venue load** (`https://tipguardsa.co.za/merchant`): **FAIL**
  - Observed: **“Venue load timed out. Please try again.”** with retry prompt.
  - Earlier in-session: analytics panel showed **“Could not find the function public.merchant_payment_analytics_v2(p_period) in the schema cache”** (missing RPC/migrations).

### DB indexes / migrations (operator action required)

**Status: NOT VERIFIED APPLIED IN PROD.** The merchant timeout strongly suggests production is missing one or more performance/venue-hydration migrations.

- **High priority indexes**: `supabase/migrations/20260627120000_venue_hydration_indexes.sql`
  - Applies hot-path indexes for QR / venue hydration.
  - SQL is safe to run repeatedly (`create index if not exists ...`).

- **Merchant analytics RPC**: `supabase/migrations/20260624140000_fintech_production_mvp.sql`
  - Defines `public.merchant_payment_analytics_v2(p_period text default '30d')` (used by merchant dashboard).

**Recommended apply path (preferred):**

1. Run `supabase db push` against the linked production project (or your existing `npm run db:push` flow).
2. Confirm PostgREST schema cache refresh (if needed): run `notify pgrst, 'reload schema';` once after migrations.
3. Re-test `https://tipguardsa.co.za/merchant` and confirm venue loads and analytics populates.

### Final result

Overall: **FAIL (blocked on prod DB migrations/indexes)**  
Once DB migrations are applied: re-run `npm run smoke:production` and repeat the merchant venue load check above.


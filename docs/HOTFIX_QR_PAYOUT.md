# Hotfix: QR tip & payout freeze (2026-05-25)

## Root causes

| Area | File:line | Issue |
|------|-----------|--------|
| QR Pay overlay | `src/pages/QrTipLanding.tsx` ~130–133 | `finally` reset `checkoutPhase` to `idle` as soon as Paystack modal opened — overlay vanished while modal open (felt “frozen” or stuck). |
| QR resolve | `src/lib/resolveTipTarget.ts` | `resolve_tip_target` / fallback RPCs had no timeout; duplicate parallel calls on re-render. |
| Pay init | `src/services/paystackCore.ts` ~131 | `paystack-initialize` invoke could hang indefinitely; stale checkout lock 90s. |
| Session | `src/lib/paymentSession.ts` | `getSession` / `refreshSession` / `getUser` without timeout blocked checkout. |
| Guard payout | `src/pages/GuardHome.tsx` ~160–171 | `setPayoutBusy(true)` with no `try/finally`; hung `request-payout` left button stuck on “Submitting…”. |
| Payout schedule | `src/components/PayoutSchedulePanel.tsx` ~49–62 | `setBusy(true)` without `try/finally` on DB update. |
| Merchant setup | `src/pages/MerchantSetup.tsx` | `setBusy` not cleared on thrown errors / slow inserts. |

**Not changed (already OK):** Edge functions use `.catch` only on `req.json()` / fetch JSON — not on Supabase query builders. `paystackCore` already skips lock release when Paystack modal is open.

## Fixes

- **`src/lib/operationTimeout.ts`** — shared 10–15s timeouts, `[TipGuard:qr|pay|payout|venue]` logging.
- **`resolveTipTarget`** — dedupe in-flight by token; timeouts on all RPC/lookup paths.
- **`paymentSession`** — timeout-wrapped session refresh chain.
- **`paystackCore`** — timeout on initialize invoke; 60s stale lock watchdog.
- **`QrTipLanding`** — do not clear `checkoutPhase` in `pay()` `finally` (modal callbacks handle it).
- **`GuardHome`** — `try/finally` + `parseFunctionsInvokeError` for payout requests.
- **`PayoutSchedulePanel`** — `try/finally` + timeout on save.
- **`MerchantSetup`** — `try/finally` + timeouts; non-blocking `refreshProfile`.

## Test checklist

### Automated (CI / local)

```bash
npm run build
npm run lint
npm run readiness
npm run verify:supabase
npm run verify:paystack
npm run smoke:production
```

Edge regression (no `.catch` on supabase builders):

```bash
rg '\.catch\(' supabase/functions --glob '*.ts' | rg -v 'req\.json|\.json\(\)|\.text\(\)'
```

### curl (production)

```bash
curl -sI https://tipguardsa.co.za/tip/demo-staging-qr-01 | head -1
curl -sI https://tipguardsa.co.za/merchant | head -1
curl -sI https://tipguardsa.co.za/guard | head -1
curl -s https://tipguardsa.co.za/api/readiness | jq .
```

### Manual

1. **QR tip** — Open `/tip/demo-staging-qr-01`, sign in, tap Pay → overlay until Paystack opens; cancel → overlay clears, can retry.
2. **Slow network** — Throttle 3G; resolve should error within ~12s with actionable message.
3. **Guard payout** — `/guard` → request payout ≥ R1 → success toast or real error; button never stuck >15s.
4. **Payout schedule** — Save weekly/monthly on guard/merchant dashboard; button clears on error.
5. **Merchant setup** — New merchant flow; Continue never spins forever.

## Follow-up: auth kick-out (`94e7426` → next commit)

**Symptom:** User “kicked out” to `/login` after Pay or on `/merchant` refresh.

| Trigger | File:line | Cause |
|---------|-----------|--------|
| Transient null on refresh | `AuthProvider.tsx` `applySession` | `TOKEN_REFRESHED` with `session=null` cleared React `user` |
| Boot network error | `AuthProvider.tsx` `getSession` | `applySession(null)` overwrote good `INITIAL_SESSION` |
| Payment timeout → “sign in” | `paymentSession.ts` (94e7426) | `withOperationTimeout` on `refreshSession` raced auth; looked like logout |
| QR Pay | `QrTipLanding.tsx` ~101 | `!user?.id` → `/login` without re-reading local session |
| Protected routes | `RequireAuth.tsx` ~15 | Immediate `<Navigate to="/login">` when `user` briefly null |

**Fix:** `authDebug.ts`, session snapshot + preserve on `TOKEN_REFRESHED`, payment session without auth `signOut`, `resolveAuthUserId`, 1.5s grace on `RequireAuth`.

## Deploy notes

- Frontend: `vercel --prod --force` after commit push.
- Edge: redeploy only if `request-payout` / `paystack-initialize` changed (this hotfix: **client only**).

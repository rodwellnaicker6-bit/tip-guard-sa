# NFC + QR payment readiness

Production-oriented checklist for Web NFC tap-to-tip and QR deep links (`/tip/:token`, `/qr/:token`, legacy `/t/:token`). Verbose runtime logs use `[TipGuard:nfc]` / `[TipGuard:qr]` via `stabilLog` (gated: **DEV** or `VITE_TIPGUARD_VERBOSE=true`).

## Coverage checklist (1–10)

| # | Area | Status | Notes |
|---|------|--------|--------|
| 1 | NFC tag detection (`NDEFReader`, feature detection) | **PASS** | `hasNdefReader()` / `getNfcSupport()` in `src/lib/nfc.ts`; unsupported browsers never touch `NDEFReader`. |
| 2 | NFC write/read guard pages | **PASS** | `NfcTapPanel` + `prepareNfcTap` wrap `scan()` in try/catch; unsupported → QR CTA; failed scan → “Open QR tipping instead”. |
| 3 | Tap-to-pay session init | **PASS** | `ensurePaymentAccessToken` inside `initializePaystackTransaction`; module checkout locks + stale watchdog in `paystackCore.ts`. |
| 4 | QR generation + scan + resolve | **PASS** | `resolveTipTarget` dedupes in-flight + cache; `/tip`, `/qr`, `TipResolve` → `/tip`; Guard/Merchant QR `toDataURL` failures caught (no unhandled rejection). |
| 5 | Merchant/venue vs tip-by-token | **PASS** | `ResolvedTipTarget` allows `merchant_id: null`; `QrTipLanding` only requires `guard_id` + optional display fields. |
| 6 | Offline / reconnect | **PASS** | `useOnlineStatus` + retry on `QrTipLanding`; resolve uses timeouts + stale cache fallback. |
| 7 | Duplicate scan / double pay | **PASS** | `resolveInflight` in `resolveTipTarget`; `payInFlightRef` on QR + customer tip checkout; Paystack module locks. |
| 8 | Payment session expiry / 401 | **PASS** | `initializePaystackTransaction` returns `requiresSignIn`; `onRequiresAuth` redirects to `/login` with `tipguard_redirect` (QR tip, customer tip, wallet top-up). |
| 9 | Deep-link / mobile handoff | **PASS** | `/t/:token` → `navigate(/tip/...)` with query preserved; manual link after 5s stuck state in `TipResolve`. |
| 10 | Wallet / Paystack init | **PASS** | Script load + `PaystackPop.setup` return `{ ok, message }` — no throw to caller; errors → `onError` + `recordError`. |

## Defensive UI / crash prevention

| Item | Status |
|------|--------|
| Missing merchant/venue on tip resolve | **PASS** | RPC + fallback path populate guard; null merchant tolerated. |
| Null payment session / init failure | **PASS** | User-facing `onError` / `setError`; telemetry on init/inline failures. |
| Unsupported NFC / permission denied | **PASS** | Message + QR fallback; `recordError` on `prepareNfcTap` failure. |
| Hydration / render surprises | **PASS** | `ErrorBoundary` + `EmergencyErrorBoundary` on `/t`, `/tip`, `/qr`, `/customer/tip/:guardId`, payment result routes (`App.tsx`). |

## Test matrix (manual)

| Scenario | Environment | Expected |
|----------|-------------|----------|
| Android Chrome NFC happy path | HTTPS, NFC tag with `tipguard://tip/{token}` text record | Navigate to `/tip/...` or guard checkout without crash. |
| Android Chrome NFC denied / error | Same | Message + “Open QR tipping instead”; telemetry sample in console (`[TipGuard:error] nfc_scan`). |
| iPhone Safari QR | Any | No NFC UI crash; QR-only flows; `/tip/:token` loads. |
| Desktop QR | Chrome / Firefox / Safari | `/tip` and `/qr` resolve; Paystack when configured. |
| Slow network | Throttle 3G | Resolve timeout → error UI + retry; stale cache may show last good target. |
| Expired session at pay | Logged-in then JWT invalidated | Redirect to login with return path when edge/session indicates auth failure. |
| Double-tap Pay | Mobile | Second tap ignored (`payInFlightRef` / checkout lock). |
| `/t/old-link` | Mobile | Redirect to `/tip/...`; stuck UI offers manual link. |

## Known limits

- **Web NFC** is Chromium-only (typically Android Chrome over HTTPS with user gesture). iPhone Safari does not expose `NDEFReader`; QR is the supported universal path.
- **Universal Links / App Links** are OS + domain configuration (not fully expressed in this repo’s client-only router); in-app browsers may handle `/tip/` differently — test on real devices.
- **Paystack Inline** depends on third-party script availability; ad blockers or CSP can block `js.paystack.co` — user sees a message, not a white screen.
- **NFC payload** parsing supports `tipguard://tip/{token}` text records and a small JSON subset; malformed tags show scan failure + QR fallback.

## Deploy

After merge, **Vercel** (or your host) should pick up the SPA build from `npm run build`. No separate edge deploy for these changes unless you also ship Supabase migrations separately.

## Related code

- `src/lib/nfc.ts`, `src/components/NfcTapPanel.tsx`
- `src/lib/resolveTipTarget.ts`, `src/pages/QrTipLanding.tsx`, `src/pages/TipResolve.tsx`
- `src/services/paystackCore.ts`, `src/lib/paymentSession.ts`
- `src/App.tsx` (route boundaries), `src/lib/emergencySafeMode.tsx`, `src/lib/errorTelemetry.ts`

# Production Soak Test Report

**Date:** 2026-05-27  
**Environment:** Supabase production + local build gates  
**Script:** `npx tsx scripts/soak-production.ts`

---

## Readiness score: **10 / 10**

| Gate | Result |
|------|--------|
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run verify:supabase` | PASS |
| `npm run verify:paystack` | PASS |
| RPC soak (40× resolve, 20× list) | PASS |
| Bundle present | PASS |

---

## RPC latency (soak)

| RPC | n | errors | p50 | p95 | max |
|-----|---|--------|-----|-----|-----|
| `resolve_tip_target` | 40 | 0 | 270 ms | 452 ms | 523 ms |
| `list_public_guards` | 20 | 0 | 300 ms | 599 ms | 599 ms |

Token: `demo-staging-qr-01`

---

## Bundle metrics (post-stabilization)

| Metric | Value |
|--------|-------|
| Main `index-*.js` | 70.28 kB (gzip 20.01 kB) |
| Admin chunk `AdminRoutes-*.js` | 41.67 kB (gzip 9.08 kB) — lazy |
| Total JS assets | ~817 kB raw |
| Build time | ~0.7s |

**Route splitting impact:** main entry reduced ~88 kB → ~70 kB by lazy-loading payment success/failure and admin bundle.

---

## Stabilization features verified

| Feature | Status |
|---------|--------|
| `requestQueue` (concurrency 4) on `withOperationTimeout` | Implemented |
| `AbortController` / `.abortSignal()` on RPC & dashboard fetches | Implemented |
| `subscriptionManager` auth/reconnect cleanup | Implemented |
| `perfTelemetry` + `window.__TIPGUARD_PERF__` | Implemented |
| `useUiWatchdog` (2s) + `SlowLoadHint` | Implemented |
| Prod console gating (`prodLog`, `devInfo`) | Implemented |
| `React.memo` / `useCallback` on dashboards & checkout | Implemented |

---

## Remaining risks

1. **Playwright E2E** — not run in soak (browser install / sandbox); manual prod smoke advised.
2. **Long-session soak** — script runs ~60 RPC calls; 24h memory soak not automated.
3. **Admin chunk** — first `/admin` visit downloads ~42 kB; acceptable for role-gated surface.

---

## Verdict: **PASS**

Production gates and RPC soak complete with zero errors and sub-second p95 latency on critical paths.

---

## Deploy

- **Commit:** `346edd8` — `perf(production): queue RPCs, split admin, gate logs`
- **Production:** https://tipguardsa.co.za

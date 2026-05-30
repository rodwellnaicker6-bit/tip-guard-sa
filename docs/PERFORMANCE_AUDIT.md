# TipGuard SA — Performance Audit

**Date:** 2026-05-25  
**Production:** https://tipguardsa.co.za  
**Scope:** Client bundle, auth boot, dashboards, QR resolve, loaders, onboarding — minimal fixes, no UI redesign.

---

## Executive summary

The app felt slow mainly due to **duplicate profile loads on boot**, **sequential dashboard queries**, **blocking analytics/touch RPCs before QR resolve**, and **awaiting profile refresh after onboarding save**. This pass removes those bottlenecks and trims loader timeouts where safe.

**Expected improvement (typical signed-in session):**

| Area | Before (approx.) | After (approx.) |
|------|------------------|-----------------|
| Auth profile load on cold boot | 2× parallel `profiles`+guards+merchants | 1× |
| Guard dashboard data | ~4 sequential round-trips | 1 guard row + 4 parallel |
| QR `/tip/:token` resolve | resolve blocked by 2 touch RPCs | resolve first; touch fire-and-forget |
| Onboarding “Saving…” | up to 15s waiting on `refreshProfile` | returns after RPC; refresh in background |
| Route lazy chunk fallback | full `PageLoader` skeleton | lightweight text |
| Sentry/analytics init | sync before `createRoot` | deferred via `requestIdleCallback` |

Hard refresh after deploy: **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows) so the browser does not serve an old JS chunk.

---

## 1. Bundle size (Vite build)

Routes are already code-split with `React.lazy` in `App.tsx`. Manual chunks: `react`, `router`, `supabase`, `sentry`.

### After fixes (local `npm run build`)

| Chunk | Raw | Gzip |
|-------|-----|------|
| `index-*.js` (app shell) | 79.3 kB | 22.4 kB |
| `react-*.js` | 189.6 kB | 59.6 kB |
| `supabase-*.js` | 196.3 kB | 50.0 kB |
| `sentry-*.js` | 81.6 kB | 27.9 kB |
| `router-*.js` | 42.1 kB | 15.0 kB |
| `GuardHome-*.js` | 11.2 kB | 3.8 kB |
| CSS | 66.8 kB | 12.7 kB |

**Notes**

- Paystack inline script is **lazy-loaded** on checkout only (`loadPaystackInlineScript`) — not in the main bundle.
- Landing/login/legal remain eager on `/` for fast first paint on marketing routes; hub routes load on demand.
- Sentry chunk still exists but **init is deferred** so it does not compete with first paint.

**Future (not in this pass):** lazy-load `Landing` if marketing LCP on deep links matters more than `/` TTFB.

---

## 2. Auth (`AuthProvider`)

### Findings

- `getSession()` and `onAuthStateChange` `INITIAL_SESSION` both called `scheduleLoadAccount` → duplicate `profiles` + `guards` + `merchants` queries.
- Rapid `refreshProfile()` calls aborted in-flight loads (onboarding, settings).
- `TOKEN_REFRESHED` correctly does **not** reload profile (unchanged).

### Fixes

- Profile load only from `onAuthStateChange` (`INITIAL_SESSION`, `SIGNED_IN`, `USER_UPDATED`); `getSession` applies session only.
- In-flight dedupe per UID; `force` on `SIGNED_IN` / `USER_UPDATED`.
- `refreshProfile` coalesces concurrent callers into one promise.
- Boot timeout: 5s → **4s**; profile fallback: 8s → **6s**.
- Focus reconnect effect deps fixed (no unnecessary re-subscribe).

---

## 3. Data fetching

- **GuardHome:** `select("*")` replaced with explicit columns; wallet, tips, payouts, and 14-day sparkline run in **`Promise.all`** after guard row loads (removed second `useEffect` round-trip).
- **Merchant dashboard:** already parallel (`merchants` + payout prefs).
- **MerchantAnalyticsPanel:** removed duplicate inline fetch in `useEffect` (uses shared `load()` only).

No new migrations in this pass; ensure indexes on `guards.user_id`, `tips.guard_id`, `tips.created_at` exist in prod (standard TipGuard schema).

---

## 4. QR / tip pages (`resolveTipTarget`)

### Before

`touch_tip_link` + `touch_qr_code` awaited **before** `resolve_tip_target` — extra latency on every scan.

### After

`resolve_tip_target` (or fallback path) runs first; touch RPCs run **fire-and-forget** after success.

---

## 5. Onboarding

### Before

After `save_onboarding_role`, UI awaited `refreshProfile` (up to 15s timeout) before navigation.

### After

Optimistic snapshot from RPC result; `void refreshProfile({ silent: true })` in background. “Saving…” clears as soon as the RPC/update completes.

---

## 6. Loaders

| Component | Change |
|-----------|--------|
| `TimedPageLoader` default timeout | 4.5s → **3.5s** |
| `App` `RouteFallback` | Text-only (no full skeleton) |
| `RequireAuth` | Still uses `TimedPageLoader` for session gate (unchanged) |

---

## 7. Boot / monitoring

- `initSentry()` + `initAnalytics()` deferred with `requestIdleCallback` (fallback `setTimeout(0)`).
- Google Fonts remain preloaded in `index.html` (acceptable for brand).

---

## 8. Production checks (2026-05-25)

| Check | Result |
|-------|--------|
| HTML TTFB `tipguardsa.co.za` | ~0.20–0.24s |
| `/` status | 200 |
| Paystack script | Not in initial HTML; loaded at checkout |

After deploy, verify `meta name="tipguard-git-sha"` matches the performance commit.

---

## User tips

1. **Hard refresh** after deploy (see above).
2. **Slow hub after login:** wait for profile badge in devtools network — should be **one** batch of 3 queries, not two.
3. **QR feels slow:** first scan should show guard name faster; scan counts update shortly after in DB.
4. **Still slow on mobile:** check 4G/Wi‑Fi and Supabase region latency; avoid leaving dozens of tabs open (session refresh).
5. **Test mode:** Paystack test flows add modal load time on first checkout only.

---

## Top 5 causes fixed (this pass)

1. Duplicate auth profile fetch on boot (`getSession` + `INITIAL_SESSION`).
2. Guard dashboard query waterfall + over-fetch (`select *`, sequential wallet/tips/payouts/sparkline).
3. QR resolve blocked by touch RPCs before `resolve_tip_target`.
4. Onboarding blocked on `refreshProfile` after save.
5. Heavy route lazy fallback + early Sentry/analytics init competing with first paint.

---

## Verification commands

```bash
npm run build   # note chunk table above
npm run lint
```

Manual: sign in → `/guard` or `/merchant` → confirm single profile batch in Network tab; scan a QR → time to guard name.

# Payment deploy verification (Vercel + Supabase)

Use this after deploying the payment error-parser fix. Production URL: **https://tip-guard-sa.vercel.app**

## Vercel production alias (verified via CLI)

```bash
npx vercel@latest inspect tip-guard-sa.vercel.app
```

Example (your alias may differ slightly):

| Field | Value |
|-------|--------|
| Deployment ID | `dpl_6p5acwbmcCV4Wu1YjZaeZ8nSXKij` |
| Deployment URL | `https://tip-guard-8cwhf1klu-rodwellnaicker6-bits-projects.vercel.app` |
| Aliases | `tip-guard-sa.vercel.app`, `tipguardsa.co.za`, … |

After a **new** deploy, `index-*.js` hash must change (e.g. `index-BWlEqu2C.js` → `index-D38bIg_Z.js`).

## Critical: deploy source must include the fix

Vercel builds from **git**. If `edgeFunctionInvoke.ts` and updated `paystackCore.ts` are only local (not pushed), redeploying Production still serves the old bundle that shows:

`Edge Function returned a non-2xx status code`

**Before redeploy:**

```bash
git status   # must include src/lib/edgeFunctionInvoke.ts, src/services/paystackCore.ts, etc.
git add -A && git commit -m "fix: surface Edge Function JSON errors in checkout"
git push origin main
```

## 1. Vercel production deployment ID

```bash
npx vercel@latest login
npx vercel@latest link    # if not linked
npx vercel@latest ls --prod
npx vercel@latest inspect tip-guard-sa.vercel.app --prod
```

Note the latest **Production** deployment ID and created time. Alias `tip-guard-sa.vercel.app` must point to that deployment.

## 2. Service worker

**None in this repo** (no `vite-plugin-pwa`, no `navigator.serviceWorker.register`).  
If DevTools → Application shows a worker from an old experiment: **Unregister**, then hard refresh.

## 3. Force redeploy (stale build / cache)

```bash
rm -rf .vercel/output dist
BUILD_ID=$(node -p Date.now()) npm run build
npx vercel@latest deploy --prod --force
```

In Dashboard: **Deployments → Production → Redeploy** → uncheck **Use existing Build Cache**.

## 4. Browser verification

1. Open https://tip-guard-sa.vercel.app
2. **Hard refresh:** Chrome/Edge `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
3. DevTools → **Console** — expect:
   - `PROD_BUILD_ACTIVE` `<timestamp>`
   - `SUPABASE_URL` `https://fyjmujhlqpvfryelnfum.supabase.co`
4. Bottom-right corner: `build:<timestamp>` badge
5. DevTools → **Network** → filter `index` — `index-*.js` hash must **change** after deploy
6. Open `paymentService-*.js` — search (pretty-print) for `TipGuard:pay` or `edgeFunctionInvoke`

## 5. API fingerprint (no auth)

```bash
curl -sS https://tip-guard-sa.vercel.app/api/debug-env | jq .
```

Expect `paymentParserMarker: "edgeFunctionInvoke-v1"` and a fresh `buildId` after deploy.

## 6. curl bundle grep (from machine)

```bash
curl -sSL https://tip-guard-sa.vercel.app/ | grep -oE 'index-[^"]+\.js'
# then:
curl -sSL "https://tip-guard-sa.vercel.app/assets/index-XXXX.js" | grep -o 'PROD_BUILD_ACTIVE\|edgeFunctionInvoke\|TipGuard:pay' | sort -u
```

**Old bundle:** only `non-2xx` path via `error.message`.  
**New bundle:** `PROD_BUILD_ACTIVE`, `TipGuard:pay`, `parseFunctionsInvokeError` (minified names may vary; `TipGuard:pay` string is stable).

## 7. Network tab checklist

| Check | Good (new bundle) | Bad (old bundle) |
|-------|-------------------|------------------|
| `index-*.js` filename | New hash after deploy | Stuck on `index-BWlEqu2C.js` |
| Response headers on document | `Cache-Control: no-store` | Long CDN cache |
| Console on load | `PROD_BUILD_ACTIVE` + numeric BUILD_ID | Missing |
| `paymentService-*.js` | Contains `TipGuard:pay` | Only generic `error.message` |
| Bottom-right UI | `build:<timestamp>` | No badge |
| Hard refresh | `Cmd+Shift+R` / `Ctrl+Shift+R` | Required after deploy |

## 8. Cache headers (temporary)

`vercel.json` sets `Cache-Control: no-store` on HTML and `/api/*`. Hashed `/assets/*` remain `immutable` (safe — filename changes each build).

## 9. Paystack initialize — Supabase logs (production)

1. [Supabase Dashboard](https://supabase.com/dashboard/project/fyjmujhlqpvfryelnfum/functions) → **paystack-initialize** → **Logs**
2. Reproduce Pay on production; look for:
   - `PAYSTACK_SECRET_KEY present` with `prefix: sk_…` and `mode: test|live`
   - `paystack_init_failed` (Paystack API error)
   - `Invalid session` / guard errors in JSON responses
3. Edge URL: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/paystack-initialize`

## 10. Expected UX after new bundle

Payment failures show the **real** JSON `error` (e.g. `Guard is not verified for payments`, `Invalid session`), not the generic non-2xx string. Console shows `[TipGuard:pay] ← paystack-initialize failed` with `status`, `code`, `body`.

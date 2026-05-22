# Performance checklist — TipGuard SA

## Build & deploy

- [ ] `npm run build` — review chunk sizes in Vite output
- [ ] Lazy routes in `App.tsx` (dashboard hubs code-split)
- [ ] `VITE_*` only — no secrets in client bundle

## Fonts & assets

- [x] `index.html` — `preconnect` + `preload` for Google Fonts (Outfit)
- [x] QR images — `loading="lazy"` on generated data URLs where shown
- [ ] Replace remote fonts with self-hosted WOFF2 for Lighthouse (post-MVP)

## Runtime

- [x] `prefers-reduced-motion` — disables `fx-fade-up` / glow animations (`src/styles/fintech.css`)
- [x] Lighthouse mobile (May 2026, production `dist` on `127.0.0.1:4173`):
  - `/` — performance **77**, accessibility **100**, best-practices **100**, SEO **91**
  - `/login` — performance **97**, accessibility **100**, best-practices **100**, SEO **91**
  - Bottleneck: Google Fonts CDN + large `react`/`supabase` chunks; self-host fonts post-MVP
- [ ] Lighthouse mobile: target performance ≥ 80 on `/` (LCP &lt; 2.5s)
- [ ] Compress hero imagery if added to landing

## Vite hints (`vite.config.ts`)

- `build.target: 'es2022'`
- `manualChunks` for `react-router` + `@supabase/supabase-js` (optional split)

## Monitoring

- `VITE_SENTRY_DSN` — production errors
- `VITE_PLAUSIBLE_DOMAIN` or `VITE_POSTHOG_KEY` — traffic (no crash if unset)

## PWA

- [x] `public/manifest.webmanifest` — standalone, theme_color, SVG icon
- [x] `OfflineBanner` — non-blocking when `navigator.onLine === false`
- [ ] Add PNG icons 192/512 for install prompts (post-MVP)

## E2E smoke

```bash
npm run build && npm run lint
npx playwright test e2e/
```

Critical paths: `e2e/boot-startup.spec.ts`, `e2e/tip-and-qr.spec.ts`, `e2e/auth-public-and-guards.spec.ts`.

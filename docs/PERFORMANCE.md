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
- [ ] Lighthouse mobile: target LCP &lt; 2.5s on `/` and `/tip/:token`
- [ ] Compress hero imagery if added to landing

## Vite hints (`vite.config.ts`)

- `build.target: 'es2022'`
- `manualChunks` for `react-router` + `@supabase/supabase-js` (optional split)

## Monitoring

- `VITE_SENTRY_DSN` — production errors
- `VITE_PLAUSIBLE_DOMAIN` or `VITE_POSTHOG_KEY` — traffic (no crash if unset)

## E2E smoke

```bash
npm run build && npm run lint
npx playwright test e2e/auth-public-and-guards.spec.ts
```

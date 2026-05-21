# Known issues — TipGuard SA

Last updated: production quality pass (May 2026).

## UX / product

| Issue | Workaround | Tracking |
|-------|------------|----------|
| Boot diagnostics banner visible in production when env issues exist | Fix `VITE_*` env; set `VITE_DEBUG_BOOT=false` once stable | Remove `showBootBanner` prod gate |
| Loyalty points are device-local preview only | None — not server-backed yet | Post-MVP rewards |
| NFC tap-to-tip requires supported Android Chrome | Use QR or manual tip flow | Hardware matrix TBD |
| Apple Pay / Google Pay depend on Paystack + device | Use card channel in checkout | Dashboard config |

## Technical

| Issue | Workaround | Tracking |
|-------|------------|----------|
| Google Fonts loaded from CDN (Lighthouse penalty) | Accept for MVP; self-host WOFF2 later | `docs/PERFORMANCE.md` |
| No service worker / offline cache yet | Offline banner + retry only | PWA phase 2 |
| `paystack-reconcile` not scheduled | Manual webhook + verify | Post-MVP |
| Admin MFA scaffold only | Restrict admin accounts | `AdminSecurity` |

## E2E / CI

| Issue | Workaround | Tracking |
|-------|------------|----------|
| Demo login e2e needs `seed:demo` + env credentials | Skip in CI without secrets | `demo-login-dashboard.spec.ts` |
| Chromium SEGV on some macOS sandboxes | `PW_CHANNEL=chrome` | Playwright config comment |

## Not bugs

- Paystack **test** banner when `pk_test_*` — expected on staging.
- Redirect to `/login` for protected routes when signed out — by design.

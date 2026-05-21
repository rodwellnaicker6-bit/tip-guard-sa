# TipGuard SA — architecture

## Stack

| Layer | Choice |
|-------|--------|
| SPA | React 19 + TypeScript + Vite 8 |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + legacy CSS variables (`src/index.css`) for gradual migration |
| Backend | Supabase (Postgres, Auth, Row Level Security, Edge Functions) |
| Payments | Abstraction in `src/payments/` — **Paystack** adapter live; **Yoco, Ozow, Peach Payments, Apple Pay, Google Pay** as planned adapters (same interface, enable in `registry.ts` when Edge + keys exist) |
| E2E | Playwright (`e2e/`, `npm run test:e2e`) |

## Ecosystem docs (lead architecture)

| Doc | Purpose |
|-----|---------|
| [ECOSYSTEM_ARCHITECTURE.md](./ECOSYSTEM_ARCHITECTURE.md) | Mermaid system map, subsystems, security invariants, scaling |
| [API_SURFACE.md](./API_SURFACE.md) | RPC + Edge inventory |
| [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md) | Phased delivery |
| [INVESTOR_BRIEF.md](./INVESTOR_BRIEF.md) | Narrative, moat, risks |
| [MONETIZATION_MODEL.md](./MONETIZATION_MODEL.md) | Revenue lines |
| [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) | Go-live verification |
| [COMPLIANCE_LAUNCH_READINESS.md](./COMPLIANCE_LAUNCH_READINESS.md) | POPIA / payments preparation (non-legal) |

## Runtime flow

1. **Auth** — Supabase Auth; `profiles` row created on signup (`role = customer`, hardened in migrations). Role elevation only via admin or `service_role`.
2. **Customer browse** — RPC `list_public_guards` (security definer) returns verified guards for anon/auth users.
3. **QR / deep link** — `/t/:token` resolves `tip_links.token` via `resolve_tip_link`; `touch_tip_link` / `touch_qr_code` record scan analytics.
4. **Checkout** — `startTipCheckout()` in `src/payments/checkoutFlow.ts` picks gateway from `VITE_TIP_PAYMENT_GATEWAY` (default `paystack`) and calls the adapter. Paystack path invokes Edge `paystack-initialize` then opens inline JS.
5. **Settlement** — Edge `paystack-webhook` (service role) finalizes tips / wallet; idempotency tables per migration; **`post_tip_settlement_hooks`** applies server loyalty, `analytics_events`, and `activity_logs`.
6. **Guard dashboard** — Reads `guards` + `tips` under RLS; payout requests via Edge `request-payout`.
7. **Admin** — `is_admin()` SQL helper; dashboards query metrics RPC + tables with admin policies.

## Directories

| Path | Purpose |
|------|---------|
| `src/payments/` | Types, registry, adapters, `checkoutFlow` |
| `src/services/paystackCore.ts` | Paystack-specific invoke + inline open (no circular imports) |
| `src/services/paymentService.ts` | Re-exports core + payments + marketing list from `lib/paymentProviders` |
| `src/lib/permissions.ts` | Role helpers + rate-limit route constants |
| `supabase/migrations/` | Ordered SQL; **apply all** on each environment |
| `supabase/functions/` | Paystack + payout Edge handlers |
| `docs/` | Operator runbooks |

## Security model

- **RLS** on all user data tables; anon only where explicitly required (`touch_tip_link`, public guard RPCs).
- **Secrets** — `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` only in Supabase secrets / CI, never in Vite.
- **Rate limiting** — structure in `api_rate_log` + Edge checks (see production migration).

## Extending payments

1. Add provider id to `PaymentGatewayId` in `src/payments/types.ts`.
2. Implement `PaymentAdapter` (see `adapters/paystackAdapter.ts`).
3. Register in `src/payments/registry.ts`.
4. Add Edge `*-webhook` + `*-initialize` mirroring Paystack patterns; log rows in `transactions` / `tips` with same idempotency discipline.

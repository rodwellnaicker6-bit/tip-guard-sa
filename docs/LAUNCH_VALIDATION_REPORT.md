# Launch validation report — TipGuard SA

**Date:** 21 May 2026  
**Git:** `main` @ `79f1b00`  
**Project:** `fyjmujhlqpvfryelnfum` (Supabase)  
**Scope:** Production validation only — no experimental features.

---

## 1. E2E payment cycle

### Documented flow

| Step | Component | Idempotency / notes |
|------|-----------|-------------------|
| 1. QR scan | `resolve_tip_target(p_token)` | Anon RPC; hardened in `20260625160000`; optional `expires_at` / `revoked_at` checks in `20260625170000` |
| 2. Init | Edge `paystack-initialize` | `claim_tip_link_session` anti-replay; duplicate pending tip blocked (15m); `payment_events` upsert `init:{reference}` with `ignoreDuplicates` |
| 3. Customer verify | Edge `paystack-verify` (JWT) | `payment_events` upsert `verify:{reference}:{status}` |
| 4. Webhook | Edge `paystack-webhook` | HMAC `x-paystack-signature`; `claim_provider_webhook_event` → legacy `claim_paystack_webhook_event`; duplicate → `200` `{ duplicate: true }` |
| 5. Finalize | `finalize_tip_from_paystack_reference` (RPC, service_role) | Wallet credit; `tips` / `transactions` status |
| 6. Payout | `request-payout` + operator | Not Paystack transfer API yet (P1) |

### Scripts run (21 May 2026)

```bash
npm run verify:paystack   # exit 0 — HMAC, webhook reachability, Paystack API
npm run verify:supabase   # exit 1 — see blockers (70000 migration)
npx tsx scripts/stress-qr-resolve.ts demo-staging-qr-01 50  # exit 0 — p50 281ms, p95 354ms, 0 errors
```

### Idempotency (code verification)

- **Webhook claim:** `supabase/functions/paystack-webhook/index.ts` — `claim_provider_webhook_event` then `claim_paystack_webhook_event`; unclaimed duplicate returns success without side effects.
- **Claim failure → retry queue:** `enqueueWebhookRetry` on claim RPC error (HTTP 500 to Paystack).
- **payment_events upsert:**
  - `paystack-initialize`: `onConflict: "provider,provider_event_id", ignoreDuplicates: true`
  - `paystack-verify`: same pattern
- **QR session:** `claim_tip_link_session` in initialize path (`20260625160000`).

### Duplicate webhook retry

- Paystack retries on non-2xx.
- Failed **claims** enqueue `webhook_retry_queue`; operator UI at `/admin/fraud`.
- Cron stub: `process-webhook-retries` — see [WEBHOOK_RETRY_QUEUE.md](./WEBHOOK_RETRY_QUEUE.md), [CRON.md](./CRON.md).

### Manual E2E (operator)

1. Scan QR or open `/tip/{token}`.
2. Sign in → checkout → Paystack test card.
3. Confirm `transactions.status = succeeded` and guard wallet updated.
4. Replay webhook in Paystack dashboard → second delivery must not double-credit (`duplicate: true` or no balance change).

---

## 2. Merchant launch readiness

| Doc | Status |
|-----|--------|
| [PRINTABLE_QR_KIT.md](./PRINTABLE_QR_KIT.md) | Present — print routes, `qr_type`, revoke/regenerate |
| [MERCHANT_ONBOARDING_GUIDE.md](./MERCHANT_ONBOARDING_GUIDE.md) | Present — wizard, KYC, operator checklist |
| [DEMO_ENVIRONMENT.md](./DEMO_ENVIRONMENT.md) | Present — `seed:demo`, verify commands |

**Activation UI:** `merchants.verified` (boolean), not `merchants.active`. `MerchantDashboard` shows **Verified** vs **Pending verification**. Location rows use `merchant_locations.active`.

**Remote gap:** `regenerate_qr_code_token` and `qr_codes.revoked_at` / `qr_type` require `20260625170000_merchant_ops_launch.sql` (verify script failed).

---

## 3. Operational monitoring

| Route | Guard | Purpose |
|-------|-------|---------|
| `/admin/metrics` | `RequireAdmin` | `admin_dashboard_metrics` RPC |
| `/admin/fraud` | `RequireAdmin` | `webhook_retry_queue`, disputes |
| `/admin` (dashboard) | `RequireAdmin` | Ops hub |

All `/admin/*` routes in `src/App.tsx` wrap children in `<RequireAdmin>` (6 routes: `/admin`, `/admin/security`, `/admin/transactions`, `/admin/analytics`, `/admin/metrics`, `/admin/fraud`).

See [MONITORING.md](./MONITORING.md) for alerts, RPC latency notes, and `payment_events` audit queries.

---

## 4. Security verification

### RLS audit ([RLS_AUDIT.md](./RLS_AUDIT.md))

| Priority | Item |
|----------|------|
| P0 | None open in doc — tips client writes blocked; `payment_events` anon blocked (verified live) |
| P1 | Broad `guards_select_authenticated` (intentional discovery); admin payout settle RPCs; payout state machine; reference-level reconcile |
| P2 | Cron not scheduled; `notify-payment` unwired |

### Session idle

`SessionIdleWatcher` → `useSessionIdle` — signs out after `VITE_SESSION_IDLE_MINUTES` of inactivity (optional; 0 = disabled). See `src/hooks/useSessionIdle.ts`.

### QR revoke / regenerate

Documented in [PRINTABLE_QR_KIT.md](./PRINTABLE_QR_KIT.md). After `20260625170000` apply:

```sql
-- Revoke (merchant/guard UI or SQL)
update public.qr_codes set revoked_at = now() where id = '<uuid>';

-- Regenerate (RPC)
select * from public.regenerate_qr_code_token('<qr_id>');
```

---

## 5. Performance & scale

| Check | Result |
|-------|--------|
| `stress-qr-resolve` (50 iter) | 0 errors; p50 **281ms**, p95 **354ms** (remote RPC) |
| Indexes `20260625160000` | `qr_codes_expires_idx` on `expires_at` |
| Indexes `20260625170000` | `qr_codes_merchant_active_idx` on `(merchant_id, qr_type)` where `revoked_at is null` |
| Lighthouse | Documented in [PERFORMANCE.md](./PERFORMANCE.md) — `/` perf 77, `/login` 97 |
| Offline | `useOnlineStatus` in `QrTipLanding`, `OfflineBanner` |

---

## 6. Production deployment reference

### Migrations to apply (in order)

1. `20260625150000_payout_schedule_preferences.sql`
2. `20260625160000_launch_qr_hardening.sql`
3. `20260625170000_merchant_ops_launch.sql`
4. Hotfixes if not already on remote: `20260625140000_payment_qr_rpc_hotfix.sql`, `20260625130000_fintech_integrity_fixes.sql`, `20260625120000_financial_ops.sql`

Use `npm run db:push` or project-specific hotfix path per [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md).

### Edge functions to deploy

| Function | Role |
|----------|------|
| `paystack-webhook` | Authoritative settlement |
| `paystack-initialize` | Checkout init |
| `paystack-verify` | Return-from-Paystack verify |
| `process-webhook-retries` | Retry queue processor |
| `reconcile-daily` | Daily reconcile stub |
| `health` | Uptime probe |

### Env checklist

**Vite (hosting):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`; optional `VITE_SESSION_IDLE_MINUTES`, `VITE_SENTRY_DSN`, `VITE_MAINTENANCE_MODE`.

**Supabase secrets:** `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_APP_URL`.

**Scripts:** `SUPABASE_SERVICE_ROLE_KEY` for `verify:supabase`, `seed:demo`.

### Build / verify commands (this pass)

| Command | Exit |
|---------|------|
| `npm run build` | 0 |
| `npm run lint` | 0 |
| `npm run verify:paystack` | 0 |
| `npm run verify:supabase` | 1 (70000) |
| `npm run test:e2e` | 1 (Playwright browsers not installed in runner) |

---

## Summary

Payment webhook HMAC and core RPCs are healthy on the linked project. **Blocker:** launch migration `20260625170000` not fully applied (merchant QR ops + `regenerate_qr_code_token`). Cron scheduling and live Paystack keys remain pre-launch ops tasks.

See [FINAL_LAUNCH_READINESS_REPORT.md](./FINAL_LAUNCH_READINESS_REPORT.md) for GO/NO-GO.

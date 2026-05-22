# Launch validation report — TipGuard SA

**Date:** 21 May 2026  
**Git:** `main` @ `dddffef`  
**Project:** `fyjmujhlqpvfryelnfum` (Supabase)  
**Scope:** Production validation only — no experimental features.

---

## 1. E2E payment cycle

### Documented flow

| Step | Component | Idempotency / notes |
|------|-----------|-------------------|
| 1. QR scan | `resolve_tip_target(p_token)` | Anon RPC; `expires_at` / `revoked_at` / `qr_type` (70000) |
| 2. Init | Edge `paystack-initialize` | `claim_tip_link_session` anti-replay; `payment_events` upsert `init:{reference}` with `ignoreDuplicates` |
| 3. Customer verify | Edge `paystack-verify` (JWT) | `payment_events` upsert `verify:{reference}:{status}` |
| 4. Webhook | Edge `paystack-webhook` | HMAC `x-paystack-signature`; `claim_provider_webhook_event` → legacy claim; duplicate → `200` `{ duplicate: true }` |
| 5. Finalize | `finalize_tip_from_paystack_reference` (RPC, service_role) | Wallet credit; `tips` / `transactions` status |
| 6. Payout | `request-payout` + operator | Manual / schedule prefs (50000); Paystack transfer API P1 |

### Scripts run (21 May 2026, final pass)

```bash
npm run verify:paystack   # exit 0
npm run verify:supabase   # exit 0
npm run stress:qr         # exit 0 — p50 254ms, p95 363ms, 0 errors
npm run build && npm run lint  # exit 0
```

### Idempotency (code verification)

| Path | Location | Mechanism |
|------|----------|-----------|
| Webhook claim | `supabase/functions/paystack-webhook/index.ts` | `claim_provider_webhook_event` then `claim_paystack_webhook_event` |
| Claim failure → queue | same | `enqueueWebhookRetry` → `webhook_retry_queue` |
| Init/verify events | `paystack-initialize`, `paystack-verify` | `onConflict: "provider,provider_event_id", ignoreDuplicates: true` |
| QR session | `claim_tip_link_session` | `20260625160000` |
| Retry drain | `process-webhook-retries/index.ts` | Row status `pending` → `processing` → `completed` / `dead_letter` |

### Duplicate webhook retry

- Paystack retries on non-2xx.
- Failed **claims** enqueue `webhook_retry_queue`; operator UI at `/admin/fraud`.
- Cron: `process-webhook-retries` — [WEBHOOK_RETRY_QUEUE.md](./WEBHOOK_RETRY_QUEUE.md), [CRON.md](./CRON.md).

### Manual E2E (operator — required before public launch)

1. Scan QR or open `/tip/{token}` (e.g. `demo-staging-qr-01` on staging).
2. Sign in → checkout → Paystack test card.
3. Confirm `transactions.status = succeeded` and guard wallet updated.
4. Replay webhook in Paystack dashboard → second delivery must not double-credit.
5. Optional: revoke QR in merchant UI; `select * from regenerate_qr_code_token('<qr_id>')` as merchant/admin.

---

## 2. Merchant launch readiness

| Doc | Status |
|-----|--------|
| [PRINTABLE_QR_KIT.md](./PRINTABLE_QR_KIT.md) | Present |
| [MERCHANT_ONBOARDING_GUIDE.md](./MERCHANT_ONBOARDING_GUIDE.md) | Present |
| [DEMO_ENVIRONMENT.md](./DEMO_ENVIRONMENT.md) | Present |

**Code:** `MerchantSetup`, `MerchantKyc`, `MerchantQr` (revoke/regenerate), `PayoutSchedulePanel`, `merchants.verified` badge on dashboard.

**RPCs (verified):** `regenerate_qr_code_token`, `resolve_tip_target` (with `qr_type`), `claim_tip_link_session`.

---

## 3. Operational monitoring

| Route | Guard | Purpose |
|-------|-------|---------|
| `/admin/metrics` | `RequireAdmin` | `admin_dashboard_metrics` |
| `/admin/fraud` | `RequireAdmin` | `webhook_retry_queue`, `logAdminAction` |
| `/admin` | `RequireAdmin` | Ops hub |

See [MONITORING.md](./MONITORING.md) for alerts and `payment_events` audit SQL.

---

## 4. Security verification

- `payment_events`: anon SELECT revoked + admin-only policy (applied on remote during this pass).
- Session idle: `SessionIdleWatcher` / `VITE_SESSION_IDLE_MINUTES`.
- QR revoke/regenerate: `revoked_at` column + `regenerate_qr_code_token` RPC.

---

## 5. Performance & scale

| Check | Result |
|-------|--------|
| `stress:qr` (50 iter) | 0 errors; p50 **254ms**, p95 **363ms** |
| Indexes | `qr_codes_expires_idx`, `qr_codes_merchant_active_idx` |

---

## 6. Production deployment reference

### Migrations applied (this pass)

1. Repaired orphan remote version `20260521192141` → reverted.
2. `supabase db query --linked -f` for `20260624130000`, `20260625150000`, `20260625160000`.
3. `drop function resolve_tip_target(text)` then `20260625170000` (return type adds `qr_type`).
4. `payment_events` RLS: `revoke select from anon` + `payment_events_admin_select` policy.
5. `supabase migration repair --status applied` for full chain through `20260625170000`.

### Edge function deploy commands

Project ref: **`fyjmujhlqpvfryelnfum`**. From repo root (Supabase CLI logged in):

```bash
PROJECT_REF=fyjmujhlqpvfryelnfum

for fn in paystack-webhook paystack-initialize paystack-verify \
  process-webhook-retries reconcile-daily request-payout health; do
  supabase functions deploy "$fn" --project-ref "$PROJECT_REF"
done
```

| Function | Role |
|----------|------|
| `paystack-webhook` | Authoritative settlement; HMAC |
| `paystack-initialize` | Checkout init; session claim |
| `paystack-verify` | Return-from-Paystack verify |
| `process-webhook-retries` | Retry queue processor (cron) |
| `reconcile-daily` | Daily reconcile (cron) |
| `request-payout` | Guard/merchant payout request |
| `health` | Uptime probe (no auth) |

Secrets: `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `PUBLIC_APP_URL`, `APP_VERSION`.

### Schema parity

`npm run verify:supabase` → **exit 0** (all RPCs, RLS, `qr_codes` columns, tables).

### Build / verify (this pass)

| Command | Exit |
|---------|------|
| `npm run build` | 0 |
| `npm run lint` | 0 |
| `npm run verify:paystack` | 0 |
| `npm run verify:supabase` | 0 |
| `npm run stress:qr` | 0 |

---

## Summary

Payment webhook HMAC, migration chain through `20260625170000`, and `verify:supabase` pass on `fyjmujhlqpvfryelnfum`. Remaining pre-launch ops: schedule cron, operator live tip E2E, live Paystack keys.

See [FINAL_LAUNCH_READINESS_REPORT.md](./FINAL_LAUNCH_READINESS_REPORT.md) for GO/NO-GO.

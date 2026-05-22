# Yield Core — production launch phase (TipGuard SA)

**Date:** 21 May 2026  
**Branch:** `main` @ `43e9d33`  
**Supabase project:** `fyjmujhlqpvfryelnfum`  
**Scope:** Strategic alignment and gap analysis only — no experimental features or UI redesign.

---

## Current status (operator-provided)

- Paystack onboarding **active**
- Dashboard **operational**
- Transactions **processing**
- Payouts **active**
- QR **functional**
- Compliance **underway**

Automated gates on this commit: `verify:paystack` / `verify:supabase` / `stress:qr` / `build` / `lint` — see [FINAL_LAUNCH_READINESS_REPORT.md](./FINAL_LAUNCH_READINESS_REPORT.md).

---

## Architecture goal

TipGuard SA is the **Phase 1 money and trust spine** for South Africa: Supabase Auth + Postgres (RLS) + Edge Functions for Paystack initialize, verify, and webhook settlement, with a mobile-first PWA for customers, guards, merchants, and admins. Yield Core extends this into a **fintech ecosystem** (merchant platform, wallets, banking rails, loyalty, partner APIs, AI analytics) by reusing the same event spine (`payment_events`, `analytics_events`, `activity_logs`, `fraud_events`) rather than bolting on parallel ledgers. Launch priority is **enterprise stability, auditability, and operator control** — not feature breadth — so Phase 2+ modules stay documented but unbuilt until Phase 1 cron, reconciliation, compliance sign-off, and live-payment E2E are closed.

---

## Priority map (launch checklist)

| # | Priority | Status | Evidence / gap |
|---|----------|--------|----------------|
| 1 | Production security hardening | **PARTIAL** | RLS + `RequireAdmin` ([MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md)); webhook HMAC (`supabase/functions/paystack-webhook/index.ts`); `payment_events` anon revoke (`20260625180000_payment_events_rls_hotfix.sql`). **Gap:** `SessionIdleWatcher` disabled in `src/App.tsx`; admin manual payout settle/release (P1-1, [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md)). |
| 2 | Webhook verification + retry | **PARTIAL** | HMAC + idempotent `claim_provider_webhook_event`; queue (`webhook_retry_queue`, [WEBHOOK_RETRY_QUEUE.md](./WEBHOOK_RETRY_QUEUE.md)); processor `supabase/functions/process-webhook-retries/index.ts`. **Gap:** Cron not scheduled ([CRON.md](./CRON.md)); full replay into webhook handler still stub. |
| 3 | Fraud / risk monitoring | **PARTIAL** | `run_fraud_checks` RPC + `supabase/functions/_shared/fraudCheck.ts`; `fraud_events`; `/admin/fraud`, `/admin/security` (`src/pages/AdminFraud.tsx`, `AdminSecurity.tsx`). **Gap:** Fail-open on RPC error; no automated scoring / alerting beyond manual admin review ([MONITORING.md](./MONITORING.md)). |
| 4 | Merchant onboarding workflow | **DONE** | `MerchantSetup`, `MerchantKyc`, `MerchantOnboardingLegal`; guide [MERCHANT_ONBOARDING_GUIDE.md](./MERCHANT_ONBOARDING_GUIDE.md); ops migration `20260625170000_merchant_ops_launch.sql`. |
| 5 | QR generation + management | **DONE** | `MerchantQr`, `MerchantQrPrint`, `regenerate_qr_code_token`, revoke/`expires_at` (`20260625160000_launch_qr_hardening.sql`); stress baseline in [FINAL_LAUNCH_READINESS_REPORT.md](./FINAL_LAUNCH_READINESS_REPORT.md). |
| 6 | Real-time analytics dashboard | **PARTIAL** | Merchant: `merchant_payment_analytics_v2` + 30s poll (`src/components/MerchantAnalyticsPanel.tsx`). Admin: `admin_ops_metrics` (`src/pages/AdminMetrics.tsx`) — load on mount, no Supabase Realtime channel. **Gap:** Sub-minute “live” ops board for admins. |
| 7 | Transaction logging + audit trails | **PARTIAL** | `payment_events` on init/verify/webhook; `activity_logs` / settlement hooks; `log_admin_audit` + `src/lib/adminAudit.ts`. **Gap:** `audit_log` table not fully wired from Edge ([AUDIT_LOG.md](./AUDIT_LOG.md)); P1-7 server-side audit for all sensitive admin mutations. |
| 8 | Mobile optimization | **PARTIAL** | PWA `public/manifest.webmanifest`, lazy routes (`src/App.tsx`), `OfflineBanner`, QR/tip flows mobile-first. **Gap:** Lighthouse perf 77 on `/` ([PERFORMANCE.md](./PERFORMANCE.md)); PNG install icons; self-hosted fonts — **POST-LAUNCH** polish. |
| 9 | Error handling + failover | **PARTIAL** | `ErrorBoundary`, optional Sentry (`src/lib/sentry.ts`), `health` Edge, `VITE_MAINTENANCE_MODE` + `MaintenancePage`, `AppBootGate` force-ready (`src/components/AppBootGate.tsx`). **Gap:** No multi-region / provider failover; incident runbook operator-driven ([INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)). |
| 10 | Database backup / recovery | **PARTIAL** | Runbook [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md), [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md). **Gap:** Pro/PITR and monthly restore drill are **operator** tasks, not enforced in repo. |
| 11 | Admin control panel | **DONE** | `/admin`, `/admin/metrics`, `/admin/fraud`, `/admin/transactions`, `/admin/analytics`, `/admin/security` behind `RequireAdmin` (`src/App.tsx`). |
| 12 | Compliance pages (Terms, Privacy, Refund) | **PARTIAL** | Routes: `src/pages/Terms.tsx`, `Privacy.tsx`, `RefundPolicy.tsx`, `PopiaNotice.tsx`. **Gap:** Templates note counsel review before public marketing; POPIA/process sign-off [COMPLIANCE_LAUNCH_READINESS.md](./COMPLIANCE_LAUNCH_READINESS.md). |
| 13 | Performance optimization | **PARTIAL** | `npm run stress:qr` pass; indexes `20260621110000_launch_stability_indexes.sql`. **Gap:** Landing LCP / font CDN; optional chunk splits ([PERFORMANCE.md](./PERFORMANCE.md)) — tune **POST-LAUNCH** if SLOs met in prod. |
| 14 | Rate limiting + abuse prevention | **PARTIAL** | `supabase/functions/_shared/rateLimit.ts` on payment/payout edges; `api_rate_log` / fraud velocity in schema. **Gap:** Edge-only limits; no CDN/WAF rate rules documented for public launch. |
| 15 | Merchant / user notifications | **GAP** | `notify-payment` scaffold ([PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md)); not wired from settlement (P2-5). Email/push **POST-LAUNCH** after Resend/VAPID secrets. |

**Summary:** 3 DONE · 11 PARTIAL · 1 GAP · 0 blocking code items for controlled launch if operator prerequisites in [FINAL_LAUNCH_READINESS_REPORT.md](./FINAL_LAUNCH_READINESS_REPORT.md) are completed.

---

## Launch-critical next 5 engineering tasks

1. **Schedule Supabase Cron jobs** — POST `process-webhook-retries` (15m) and `reconcile-daily` (02:00 SAST) per [CRON.md](./CRON.md); verify `webhook_retry_queue` drain in `/admin/fraud`.
2. **Close live payment E2E** — Switch Paystack to live keys when approved; run one tip → webhook → balance check; document in [BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md) on production URL.
3. **P1 payout integrity** — Admin payout status changes must call `settle_guard_payout_hold` / `release_guard_payout_hold` (today manual path risks drift — see [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md), `src/pages/AdminTransactions.tsx`, `supabase/functions/request-payout/index.ts`).
4. **Compliance sign-off** — Legal review of `src/pages/Terms.tsx`, `Privacy.tsx`, `RefundPolicy.tsx`; complete checklist below and [COMPLIANCE_LAUNCH_READINESS.md](./COMPLIANCE_LAUNCH_READINESS.md).
5. **Post-migration Edge redeploy + verify** — Redeploy `paystack-webhook`, `paystack-initialize`, `paystack-verify`, `request-payout`, `process-webhook-retries`, `reconcile-daily`; run `npm run verify:paystack` and `npm run verify:supabase` ([LAUNCH_VALIDATION_REPORT.md](./LAUNCH_VALIDATION_REPORT.md) §6).

---

## Compliance sign-off checklist

| Item | Owner | Status |
|------|-------|--------|
| Counsel-reviewed Terms, Privacy, Refunds (replace template disclaimers in legal pages) | Legal | ☐ |
| POPIA purpose, retention, and access process documented and linked from Settings | Ops / Legal | ☐ |
| Paystack live merchant agreement + webhook URL + HMAC secret in dashboard | Ops | ☐ |
| PCI scope: hosted/redirect only; no PAN in SPA | Engineering | ☑ (architecture) |
| KYC / venue verification SOP for merchants (`kyc_cases`, admin review) | Ops | ☐ |
| Chargeback / dispute runbook aligned with Paystack notifications | Ops | ☐ |
| Cookie / analytics disclosure if Sentry or Plausible/PostHog enabled in prod | Engineering | ☐ |
| Beta production sign-off ([BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md)) | Product | ☐ |
| P0 financial integrity migration applied + smoke tests ([PRODUCTION_RISK_REPORT.md](./PRODUCTION_RISK_REPORT.md)) | Engineering | ☑ (code); ☐ operator smoke on live |

---

## Ecosystem roadmap

| Capability | Phase 1 (launch — TipGuard / Yield Core spine) | Phase 2+ (document only) |
|------------|--------------------------------------------------|---------------------------|
| Paystack tips + webhooks | ✓ In production path | Additional rails (Yoco, Ozow) per [PRODUCTION_ROADMAP.md](./PRODUCTION_ROADMAP.md) |
| QR + tip sessions | ✓ | NFC / RFID hardware layer |
| Merchant onboarding + KYC | ✓ MVP self-attest | Formal ID/bank KYC integrator |
| Guard/merchant dashboards + admin ops | ✓ | Full merchant **platform** (multi-location billing, invoices) |
| Wallets + payouts | ✓ Core ledger + manual/scheduled payout | **Smart payouts**, batched EFT, Paystack transfer automation |
| Analytics | RPC + polling dashboards | **AI analytics** (YieldCore batch / warehouse) |
| Notifications | Scaffold only | Email, push, in-app fan-out |
| Loyalty / referrals | Schema + hooks | Redemption catalog, campaigns |
| Banking / treasury | Operator SOP | Banking integrations, platform fee ledger |
| Partner APIs | Internal RPC/Edge only | Public partner API + keys |
| Fraud | Rules + admin UI | ML scoring on `fraud_events` |

Phase 2+ items must not ship in the launch branch unless they close a **P0/P1** blocker above.

---

## Related documents

- [FINAL_LAUNCH_READINESS_REPORT.md](./FINAL_LAUNCH_READINESS_REPORT.md) — **GO** decision and automated test matrix
- [ECOSYSTEM_ARCHITECTURE.md](./ECOSYSTEM_ARCHITECTURE.md) — subsystem map
- [REMAINING_BLOCKERS.md](./REMAINING_BLOCKERS.md) — open P1/P2 items
- [PRODUCTION_RISK_REPORT.md](./PRODUCTION_RISK_REPORT.md) — financial integrity audit

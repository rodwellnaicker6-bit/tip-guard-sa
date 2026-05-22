# TipGuard SA — controlled production beta rollout

**Baseline:** `main` @ `21ce6c6` (verification green). **Principle:** reliability over rapid growth. Yield Core = scalable SA fintech infrastructure; beta validates ops before scale.

## Durban-first, invite-only (operational rule)

- **Geography:** Phase 0–1 merchants and guards are **Durban / KZN venues only** unless operator explicitly approves an exception.
- **Access:** **Invite-only** — no public self-serve merchant signup; operator creates account, assigns merchant role, enables `verified` after KYC ([PHASE0_MERCHANT_PACK_DURBAN.md](./PHASE0_MERCHANT_PACK_DURBAN.md)).
- **Scale cap:** Do **not** raise merchant cap or marketing reach until **payout settlement** (`admin_update_payout_status` + Paystack transfer webhooks) and **webhook reconciliation** (`reconcile-daily`, DLQ = 0) are stable for **7 consecutive days** in Phase 0.
- **Session security:** Production admin sessions may set `VITE_SESSION_IDLE_MINUTES=30` ([SESSION_SECURITY.md](./SESSION_SECURITY.md)); unset or `0` keeps idle logout off.
- **Alerts:** Beta thresholds in [MONITORING.md](./MONITORING.md) — health down, reconcile mismatch &gt; 0, webhook DLQ &gt; 5.

## Phase model

| Phase | Name | Merchant cap | Entry criteria | Exit criteria (advance) |
|-------|------|--------------|----------------|-------------------------|
| 0 | **Pilot** | 1–2 invited venues | [COMPLIANCE_SIGNOFF.md](./COMPLIANCE_SIGNOFF.md) items 1–5, 6–7 ticked; `pk_test_` E2E green; backups confirmed | 7 days: 0 P0 incidents; webhook DLQ = 0; payout smoke passed; operator sign-off |
| 1 | **Limited beta** | ≤ **10** verified merchants | Phase 0 exit; `pk_live_` cutover complete; daily metrics review 7 days | 14 days: tips/day stable; p95 QR &lt; 500ms; failed webhooks &lt; 3/day; recon mismatches = 0 |
| 2 | **Scale** | Cap raised in batches (+10) | Phase 1 exit; Sentry error rate flat; cron retries healthy | Product/marketing go-live per [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) |

**Rollback to prior phase** if any [rollback trigger](#rollback-triggers) fires.

## Merchant onboarding cap & invites

- **Cap:** Hard limit **10** `merchants.verified = true` during Phase 1. Track in Admin → Overview (merchants verified / total). Do not bulk-enable KYC until cap headroom exists.
- **Onboarding path:** `/merchant/setup` → KYC → operator sets `verified = true` ([MERCHANT_ONBOARDING_GUIDE.md](./MERCHANT_ONBOARDING_GUIDE.md)).
- **Invites:** Staff invite scaffold in [MERCHANT_INVITES.md](./MERCHANT_INVITES.md) (post-MVP). For beta, onboard merchants manually: create account → assign merchant role → send production URL; optional `merchant_invites` row when Edge invite flow ships.
- **Gate:** No `pk_live_` tips for merchants until KYC approved and at least one verified guard for staff/table QRs.

## Live transaction monitoring (daily operator playbook)

**Morning (5 min)**

1. Open **`/admin/metrics`** — record: tips today, failed webhooks, DLQ, QR scans (24h), recon mismatches (7d).
2. GET **health** Edge (link on metrics page) — expect `ok: true`, `supabase: ok`.
3. Paystack Dashboard → Webhooks — no sustained 4xx/5xx to `paystack-webhook`.

**During day**

| Watch | Threshold | Action |
|-------|-----------|--------|
| Tips today vs prior day | &gt; 50% drop with active merchants | Check Paystack status, `payment_events`, Edge logs |
| Failed webhooks | &gt; 0 sustained | `/admin/fraud`; run `process-webhook-retries` ([CRON.md](./CRON.md)) |
| DLQ size | &gt; 0 | Inspect payload in `webhook_retry_queue`; [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) |
| Recon mismatches (7d) | &gt; 0 | Run `reconcile-daily`; review `reconciliation_log` |
| Sentry | Spike on TipCheckout / paystack | Triage; freeze new merchant invites if payment path broken |
| Open disputes | New rows | Admin hub → merchant dispute workflow |

**Weekly:** [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md) beta check; `npm run stress:qr` on a production token ([STRESS_TEST.md](./STRESS_TEST.md)).

Full alert matrix: [MONITORING.md](./MONITORING.md).

## Live key rollout safety (`pk_test` → `pk_live`)

Complete [COMPLIANCE_SIGNOFF.md](./COMPLIANCE_SIGNOFF.md) **before** live keys.

| Step | Where | Check |
|------|-------|-------|
| 1 | Paystack | Live merchant approved; webhook URL unchanged (`…/functions/v1/paystack-webhook`) |
| 2 | Supabase secrets | `PAYSTACK_SECRET_KEY` → `sk_live_…`; redeploy Edge (`paystack-initialize`, `paystack-verify`, `paystack-webhook`) |
| 3 | Vercel Production | `VITE_PAYSTACK_PUBLIC_KEY` → `pk_live_…`; remove or set `VITE_PAYSTACK_TEST_MODE=false` |
| 4 | Build | `npm run build` — no test-mode banner on production |
| 5 | Verify | `npm run verify:paystack` (live project); one **small** live tip (R10) on invited merchant QR |
| 6 | Rollback kit | Keep previous `sk_test_` / `pk_test_` values in secure vault; revert Vercel + secrets if step 5 fails |

**Never** mix `pk_live_` client with `sk_test_` server (or reverse). `paystack-initialize` sets `metadata.paystack_test` from secret prefix for support.

## Anomaly detection (fraud)

**Rules (DB):** `public.fraud_rules` — `velocity_per_user_hour`, `amount_cap_cents`, `duplicate_reference` (migration `20260625120000_financial_ops.sql`).

**Enforcement (wired):**

| Path | Edge function | Behaviour |
|------|---------------|-----------|
| Tip init | `paystack-initialize` | `run_fraud_checks` → **403** `fraud_blocked` if triggered |
| Return verify | `paystack-verify` | Checks logged; events in `fraud_events` |
| Webhook | `paystack-webhook` | Post-success checks for audit |

Shared helper: `supabase/functions/_shared/fraudCheck.ts` → RPC `run_fraud_checks` (service_role). **Note:** RPC error fails **open** (allows payment); monitor Edge logs for `run_fraud_checks` errors.

**Admin review:** [`/admin/fraud`](/admin/fraud) — DLQ, fraud events, security signals. Link from `/admin/metrics`.

## Payout reliability (operator test)

Run on **staging first**, then one live guard in Phase 0.

1. **Guard:** Dashboard → request payout (`request-payout` Edge) — status `pending`.
2. **Paystack / transfer:** Confirm webhook or manual transfer record aligns with `payout_requests` row.
3. **Admin:** `/admin` → Payouts tab → **Processing** → **Paid** via `admin_update_payout_status` RPC (releases hold, audit logged).
4. **Reject path:** `pending` → **Rejected** — hold released; verify in `admin_audit_log`.

Checklist item: `scripts/operator-e2e-checklist.sh` section 4. Freeze test: Admin → Freeze payouts → `request-payout` returns 503.

## Payment audit logs (any tip reference)

```sql
-- Provider event trail
select id, provider, provider_event_id, event_type, status, paystack_reference, created_at
from public.payment_events
where paystack_reference = '<reference>'
   or provider_event_id ilike '%<reference>%'
order by created_at;

-- Admin actions on entity
select action, entity_type, entity_id, metadata, created_at
from public.admin_audit_log
where entity_id = '<tip_id or payout_id>'
   or metadata::text ilike '%<reference>%'
order by created_at desc
limit 50;
```

See also [MONITORING.md](./MONITORING.md) (`payment_events` queries) and [AUDIT_LOG.md](./AUDIT_LOG.md).

## Admin moderation (beta support)

| Surface | Route | Use |
|---------|-------|-----|
| Hub | `/admin` | Overview, payout freeze, guard approve/reject/flag |
| Failed payments | `/admin` → **Failed** tab | `transactions.status = failed` |
| Fraud & DLQ | `/admin/fraud` | Webhook retries, fraud_events |
| Ops metrics | `/admin/metrics` | Daily counters + beta playbook link |

Guard **Approve** sets `verified = true`; **Reject** logs `fraud_events`; **Flag** for manual review.

## QR performance (beta target)

Reference: `npm run stress:qr` — **21 May 2026** baseline p50 254ms, p95 363ms (50 iter). Beta target: **100 scans**, **p95 &lt; 500ms**, error rate &lt; 5% ([STRESS_TEST.md](./STRESS_TEST.md)).

## Performance & load

- Lighthouse baselines: [PERFORMANCE.md](./PERFORMANCE.md) (`/` perf 77, `/login` 97).
- Beta schedule: week 1 daily `stress:qr` × 50; week 2 × 100 before Phase 1 exit; after merchant +20% traffic, re-run Lighthouse on `/` and `/login`.

## Backup & recovery

Weekly operator checklist: [BACKUP_VERIFICATION.md](./BACKUP_VERIFICATION.md#beta-weekly-check-production). Before migrations: pause webhooks or maintenance mode ([ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)).

## Compliance gate

Beta **Phase 0 → live keys** requires [COMPLIANCE_SIGNOFF.md](./COMPLIANCE_SIGNOFF.md) rows 1–5, 7, 10, 11 complete. Engineering item 6 (PCI) pre-ticked.

## Observability (single-page ops summary)

| Tool | URL / path |
|------|------------|
| Ops metrics | `/admin/metrics` |
| Fraud & DLQ | `/admin/fraud` |
| Admin hub | `/admin` |
| Health | `https://<project-ref>.supabase.co/functions/v1/health` |
| External uptime | Configure GET on health URL ([MONITORING.md](./MONITORING.md)) |
| Sentry | Production project (when `VITE_SENTRY_DSN` set) |
| Paystack | Dashboard webhooks + transactions |

## Rollback triggers

Execute [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md) and **pause new merchant onboarding** if:

- Health endpoint 503 or `supabase: degraded` &gt; 15 min
- Payment success rate &lt; 95% over 1 h with active QR traffic
- DLQ growth &gt; 5 rows/day without resolution
- Reconciliation mismatches &gt; 0 after `reconcile-daily` + manual review
- Confirmed duplicate settlement or fraud rule bypass (duplicate reference)
- Data loss / backup restore required

**Soft rollback:** revert to `pk_test_` on Vercel + Supabase secrets; enable `VITE_MAINTENANCE_MODE` for new checkouts while fixing.

## Related docs

- [MONITORING.md](./MONITORING.md) — beta alert thresholds (health, DLQ, reconcile)
- [LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md) — `pk_test` → `pk_live` checklist
- [OPERATOR_DAILY_CHECKLIST.md](./OPERATOR_DAILY_CHECKLIST.md) — daily operator routine
- [OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md) — payout state machine
- [CRON_OPERATOR_RUNBOOK.md](./CRON_OPERATOR_RUNBOOK.md) — schedule webhook retry + reconcile
- [BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md) — external testers
- [BETA_LAUNCH.md](./BETA_LAUNCH.md) — pre-flight commands
- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) — full go-live
- [YIELD_CORE_LAUNCH_PHASE.md](./YIELD_CORE_LAUNCH_PHASE.md) — capability matrix

# Admin procedures (TipGuard SA)

**Access:** Users with admin role → `/admin`, `/admin/fraud`, `/admin/transactions`, `/admin/metrics`.  
**Audit:** Sensitive actions should appear in `admin_audit_log` (RPC-backed payout changes; client `logAdminAction` for guard/freeze/disputes).

## Approve guard (KYC)

1. `/admin` → **Guards** tab.
2. Review pending guard profile and merchant linkage.
3. **Approve** → sets `guards.verified = true`; logs `guard_approve`.
4. Merchant can assign guard to locations / QRs after verification.

**Reject:** logs `fraud_events` + `guard_reject` audit.  
**Flag:** `guard_flag` for manual review without verifying.

## Failed payment

1. `/admin` → **Failed** tab — `transactions.status = failed`.
2. Note `paystack_reference`; trace in [AUDIT_LOGGING.md](./AUDIT_LOGGING.md) `payment_events` query.
3. Customer retry: new tip flow (do not reuse stale reference).
4. If webhook missed success: `/admin/fraud` → DLQ; replay per [WEBHOOK_RETRY_QUEUE.md](./WEBHOOK_RETRY_QUEUE.md).
5. Merchant dispute if charge disputed → **Disputes** on merchant hub; admin resolves on `/admin/fraud` (`dispute_resolve` audit).

## Payout freeze

1. `/admin` → **Freeze payouts** (overview).
2. Confirms `platform_settings.payouts_frozen = true`; `request-payout` blocked.
3. Unfreeze only after root cause cleared (fraud, reconcile, or Paystack outage).
4. Detail: [OPERATOR_PAYOUT_PROCEDURES.md](./OPERATOR_PAYOUT_PROCEDURES.md).

## Payout approve / reject

Use **Payouts** tab only — `admin_update_payout_status` RPC. Never edit payout rows in Studio during beta.

| Action | Button |
|--------|--------|
| Start processing | Processing |
| Complete | Paid |
| Decline | Rejected |
| Transfer failed | Failed |

## Disputes

1. Merchant: `/merchant/disputes` creates row.
2. Admin: `/admin/fraud` — review and resolve; `dispute_resolve` logged.
3. Link tip / transaction in `payment_events` before closing.

## Security

- Admin tablets: set `VITE_SESSION_IDLE_MINUTES=30` ([SESSION_SECURITY.md](./SESSION_SECURITY.md)).
- Do not share service role key; cron uses Vault only ([CRON_OPERATOR_RUNBOOK.md](./CRON_OPERATOR_RUNBOOK.md)).

## Related

- [OPERATOR_DAILY_CHECKLIST.md](./OPERATOR_DAILY_CHECKLIST.md)
- [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)

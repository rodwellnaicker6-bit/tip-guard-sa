# TipGuard SA — API surface (production)

## PostgREST tables (RLS-enforced)

High-traffic reads/writes used by the SPA (non-exhaustive; see `supabase/migrations/` for full schema):

| Table / view | Who reads | Who writes |
|--------------|-----------|------------|
| `profiles` | Self | Self (non-privileged fields); server: Paystack customer code, referral code |
| `guards` | Owner, admin; public via RPC | Owner profile fields; balances via **Edge/service only** |
| `merchants` | Owner, admin | Owner business fields; `onboarding_stage` draft→submitted; verified via **admin/service** |
| `tips` | Payer, guard owner | Create via Edge / checkout pipeline |
| `transactions` | Payer, admin | Edge updates status |
| `tip_sessions` | Payer, guard, admin | Payer creates session; `payment_surface` for QR / wallet / NFC prep |
| `tip_links`, `qr_codes` | Owner, admin | Owner |
| `payout_requests` | Owner, admin | Owner insert; admin updates status |
| `referrals` | Referrer, referee, admin | **service_role** attribution function |
| `loyalty_wallets`, `loyalty_ledger` | Self, admin | **service_role** RPC only |
| `kyc_cases` | Party owner, admin | Owner draft + submit policies |
| `analytics_events` | Admin | **service_role** / Edge (no direct client insert) |
| `activity_logs` | Admin | **service_role** / Edge |
| `fraud_events` | Admin | Edge / service |

## RPCs (selected)

| Function | Caller | Purpose |
|----------|--------|---------|
| `list_public_guards`, `get_public_guard` | anon, authenticated | Verified guard discovery |
| `resolve_tip_link`, `touch_tip_link`, `touch_qr_code` | anon, authenticated | QR funnel + scan counts |
| `create_tip_session_for_guard` | authenticated | Checkout session bootstrap |
| `finalize_tip_from_paystack_reference` | **service_role** | Atomic tip success + guard credit |
| `post_tip_settlement_hooks` | **service_role** | Loyalty + analytics + activity after tip |
| `claim_paystack_webhook_event` | **service_role** | Webhook idempotency |
| `credit_wallet` | **service_role** | Wallet top-up credit |
| `register_referral_attribution` | **service_role** | Post-signup referral bind |
| `admin_dashboard_metrics` | admin JWT | KPI JSON for ops / investor views |

## Edge Functions

| Name | Auth | Role |
|------|------|------|
| `paystack-initialize` | User JWT (verify) + rate log | Start Paystack transaction; metadata encodes `guard_tip` / `wallet_topup` |
| `paystack-webhook` | Paystack HMAC | Settlement, hooks, transaction rows |
| `request-payout` | User JWT | Create payout request row |

## Future (tap-to-pay / YieldCore)

- **Device registry Edge**: bind `rfid_tags` or new `payment_device_bindings` to `guard_id` with attestation.  
- **YieldCore**: outbound signed webhook or batch export from `analytics_events` + `loyalty_ledger` (no PII in payload by default).

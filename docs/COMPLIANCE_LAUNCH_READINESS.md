# TipGuard SA — compliance & launch readiness (South Africa)

This is a **preparation** checklist for POPIA-aligned operations and investor due diligence. It is not legal advice.

## Personal information (POPIA)

- **Minimise collection**: only ask fields you need for a stated purpose (e.g. venue verification, payouts, support).  
- **Purpose limitation**: document why `profiles`, `merchants`, `kyc_cases`, and payment metadata are processed.  
- **Retention**: define how long `activity_logs`, `analytics_events`, and `fraud_events` are kept; archive or delete on schedule.  
- **Access & correction**: users reach you via support; `profiles` self-service updates stay within RLS-safe fields.  
- **Security safeguards**: TLS everywhere; no service keys in the SPA; webhook HMAC verification; RLS on all tenant tables.  
- **Cross-border**: if analytics or backups leave ZA, record the transfer basis and safeguards.

## Payments

- **PCI scope**: prefer hosted / redirect flows (Paystack) over raw card handling in-app.  
- **Receipts**: informational receipts are fine; statutory tax invoices may require registered entity details — align with your accountant.  
- **Chargebacks**: document operator workflow when Paystack notifies disputes.

## Merchant KYC (MVP)

- The in-app **venue verification** flow collects **self-attested** declarations and optional registration numbers.  
- Formal ID / bank verification may be added via Storage + third-party KYC without changing the core `kyc_cases` state machine.

## Testing before go-live

- Auth: email confirmation, password reset, deep link return paths.  
- Payments: successful tip, failed tip, duplicate webhook (idempotency).  
- Merchants: setup → KYC submit → admin can see case in DB (SQL or future admin UI).  
- Admin: metrics RPC, payout state transitions.

See also [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) and [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md).

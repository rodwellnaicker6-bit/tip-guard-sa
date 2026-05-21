# TipGuard SA — production roadmap

Priorities: **speed**, **scalability**, **security**, **monetization**, and **national rollout** in ZA.

## Phase 0 — Foundation (done / continuous)

- [x] Supabase Auth + hardened `profiles` role model  
- [x] Paystack checkout + webhook + idempotency  
- [x] RLS on user data; admin helpers  
- [x] QR + tip sessions + scan analytics  
- [x] Ecosystem migration: loyalty ledger, referrals schema, KYC cases, analytics spine, merchant onboarding stages  

## Phase 1 — Go-live hardening (0–4 weeks)

- [ ] Run migration `20260621100000_ecosystem_scaling_core.sql` on staging → production  
- [ ] Wire **referral capture** on signup (Edge: read `ref` query param → `register_referral_attribution` after first session)  
- [ ] KYC UX: guard/merchant forms → `kyc_cases` draft → submitted  
- [ ] Treasury playbook: payout approval SOP, bank file export  
- [ ] Observability: structured logs from Edge + error budgets  
- [ ] Load test: concurrent checkouts (Paystack test mode)  

## Phase 2 — Revenue & B2B (4–12 weeks)

- [ ] **Platform fee** on tips (metadata + RPC change to credit net; separate `platform_revenue_ledger`)  
- [ ] Merchant **location packages** (monthly) via existing `subscriptions` + Paystack plans  
- [ ] **Invoice PDF** generation (Edge + storage bucket) for merchants  
- [ ] Dispute / chargeback workflow documentation  

## Phase 3 — Omnichannel payments (12–24 weeks)

- [ ] Formal **Yoco** / **Ozow** adapters mirroring `src/payments/` interfaces  
- [ ] Apple Pay / Google Pay UX flags driven by Paystack + browser capability matrix  
- [ ] **NFC tap-to-tip** pilot: Web NFC + attested Android reader; `payment_surface` analytics  
- [ ] RFID batch provisioning admin tool  

## Phase 4 — Scale & intelligence (12+ weeks)

- [ ] Read replica or warehouse sync for analytics  
- [ ] **YieldCore AI**: consent-based export of aggregate tipping patterns (no raw payer identity)  
- [ ] Fraud scoring model fed by `fraud_events` + velocity windows  

## Dependencies

- Regulatory: PCI scope stays **redirect / hosted fields** where possible; SA exchange control for cross-border if adding FX.  
- Partner: Paystack live approval, settlement timing, and chargeback SLAs.

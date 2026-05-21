# TipGuard SA — monetization model

Designed to align with **South African PSP economics** (Paystack/Yoco interchange + scheme fees) while building **recurring B2B revenue** not solely dependent on tip volume.

## 1. Interchange-style platform fee (primary GMV take)

- **Model**: configurable **percentage + fixed cap** on each successful tip (e.g. 3–6% capped at R5 per tip).  
- **Implementation**: extend `finalize_tip_from_paystack_reference` to credit **net** to `guards.balance_cents` and record gross vs fee in a new `platform_fee_ledger` (recommended next migration).  
- **Transparency**: show fee line in customer receipt and guard earnings breakdown.

## 2. Merchant SaaS (recurring)

- **Per-site / per-bundle pricing** for dashboard, staff pools, branded QR, and monthly analytics export.  
- **Billing**: existing `subscriptions` + Paystack plan codes (`paystack-create-plan` path).  
- **Upsell**: priority support, dedicated account manager for national chains.

## 3. Payouts & treasury services

- **Model**: small **payout facilitation fee** (flat or bps) when moving funds to guard bank accounts; optional **instant payout** premium.  
- **Guardrail**: fee only on successful bank settlement; never stack hidden FX (ZAR-native).

## 4. Referral & growth incentives

- **Model**: capped **CPA** (once per qualified referee) or **revenue share for 90 days** on referee tips — funded from marketing budget, not infinite liability.  
- **Implementation**: `referrals.status` transitions `pending → qualified` when referee completes KYC + first tip; **rewarded** when finance batch pays.

## 5. Data & insights (YieldCore alignment)

- **Aggregate** heatmaps and demand curves (no individual payer identity in exports).  
- **Monetization**: B2G / B2B subscriptions for precinct-level insights; **YieldCore AI** consumes the same `analytics_events` stream under contract.

## 6. Hardware & NFC (future)

- **Model**: sell or lease **attested tap devices** / RFID bands to large venues; low margin hardware, high lock-in.  
- **Prerequisite**: `payment_surface` analytics + device registry Edge.

## What we avoid

- Hidden spreads on ZAR.  
- Uncapped marketing burn on loyalty points (ledger is internal; redemption catalog must be funded).

## Unit economics checklist

- [ ] Define blended PSP cost (bps + fixed).  
- [ ] Set platform fee ≥ PSP + ops + fraud reserve.  
- [ ] Model loyalty points as **marketing expense** with monthly cap.

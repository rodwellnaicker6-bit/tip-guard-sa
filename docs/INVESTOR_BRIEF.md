# TipGuard SA — investor feature summary

## One-liner

TipGuard SA is a **vertical payments + workforce tipping network** for South Africa: verified guards and venue merchants receive instant digital tips and payouts, with **enterprise-grade compliance hooks** (KYC cases, audit logs, fraud signals) and a path to **B2B venue contracts** and **platform take-rate**.

## Problem

Cash tipping is friction-heavy, unsafe to reconcile, and invisible to operators. Yoco/SnapScan excel at merchant POS but under-serve **named, verified frontline workers** and **multi-site guard networks**.

## Solution

- **Consumer app**: discover verified guards, one-tap tip, QR deep links, wallet-style hub.  
- **Guard app**: QR + earnings + payout requests + live tip feed.  
- **Merchant app**: venue identity, future staff tipping pools, analytics.  
- **Admin console**: verification queue, payouts, fraud queue, ecosystem KPIs (tips, merchants, loyalty liability, KYC backlog, analytics volume).

## Moat (defensible angles)

1. **Verification + KYC workflow** tied to physical sites and employer relationships.  
2. **Ledger discipline**: atomic settlement RPCs, webhook idempotency, append-only loyalty and analytics.  
3. **Distribution**: B2B contracts with retail, logistics, and security firms (national footprint).  
4. **Data flywheel** (POPIA-compliant): aggregate demand curves by precinct / shift for staffing analytics — **YieldCore**-ready export.

## Traction metrics to instrument

- GMV (successful `tips.amount_cents`)  
- Active guards / merchants / tippers (WAU)  
- Payout velocity and rejection rate  
- Referral attach rate (`referrals` / new signups)  
- Repeat tip rate (from `loyalty_ledger` + `tips`)

## Risks (transparent)

- Payment partner concentration (mitigate: second PSP adapter).  
- Regulatory classification of stored value if wallet scope expands.  
- Operational load of manual KYC at scale (mitigate: partner KYC API).

## Ask use of funds (typical)

- Compliance + ops hires  
- B2B sales for national retailers  
- Mobile performance and offline-first QR caching  
- Fraud analytics headroom

See [MONETIZATION_MODEL.md](./MONETIZATION_MODEL.md) for revenue lines.

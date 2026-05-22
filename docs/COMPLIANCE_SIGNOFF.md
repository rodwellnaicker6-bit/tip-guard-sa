# Compliance sign-off checklist (operator / legal)

Complete before public marketing launch. Engineering cannot obtain counsel sign-off in-repo; tick each item when done.

| # | Item | Owner | Done |
|---|------|-------|------|
| 1 | Counsel-reviewed **Terms** (`/terms` — `src/pages/Terms.tsx`) | Legal | ☐ |
| 2 | Counsel-reviewed **Privacy** (`/privacy` — `src/pages/Privacy.tsx`) | Legal | ☐ |
| 3 | Counsel-reviewed **Refund policy** (`/legal/refunds` — `src/pages/RefundPolicy.tsx`) | Legal | ☐ |
| 4 | POPIA notice linked from Settings (`/legal/popia` — `src/pages/PopiaNotice.tsx`) | Ops / Legal | ☐ |
| 5 | Paystack **live** merchant agreement + production webhook URL + HMAC secret | Ops | ☐ |
| 6 | PCI scope confirmed: hosted/redirect only; no PAN in SPA | Engineering | ☑ |
| 7 | Merchant KYC / venue verification SOP (`kyc_cases`, admin review) | Ops | ☐ |
| 8 | Chargeback / dispute runbook aligned with Paystack notifications | Ops | ☐ |
| 9 | Cookie / analytics disclosure if Sentry or analytics enabled in prod | Engineering | ☐ |
| 10 | Beta production sign-off ([BETA_TESTER_CHECKLIST.md](./BETA_TESTER_CHECKLIST.md)) | Product | ☐ |
| 11 | P0 financial integrity smoke on **live** ([PRODUCTION_RISK_REPORT.md](./PRODUCTION_RISK_REPORT.md)) | Engineering / Ops | ☐ |

## Route smoke (engineering)

Open on production URL:

- `/terms`
- `/privacy`
- `/legal/refunds`
- `/legal/popia`

## Sign-off record

| Field | Value |
|-------|--------|
| Date | |
| Signed by (name / role) | |
| Production URL | |
| Notes | |

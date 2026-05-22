# QR resolve stress test

## Script

```bash
npx tsx scripts/stress-qr-resolve.ts [token] [iterations]
```

Default: `demo-staging-qr-01`, 50 iterations.

Requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## What it checks

- `resolve_tip_target` latency (p50/p95)
- Error rate (expired/revoked tokens should fail consistently)
- Optional `touch_qr_code` per iteration

## Production

Run against staging only. High volume may inflate `payment_events` qr.scan rows (service-side audit).

## Beta production target

Controlled beta exit criteria ([BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md)):

| Metric | Target |
|--------|--------|
| Iterations | **100** (`npx tsx scripts/stress-qr-resolve.ts <prod-token> 100`) |
| p95 latency | **&lt; 500ms** |
| Error rate | **&lt; 5%** (revoked/expired tokens excluded from denominator if documented) |

Run against a **live** merchant QR token during Phase 1; avoid demo/staging tokens on production.

## Indexes

If p95 > 200ms, confirm indexes from `20260625160000_launch_qr_hardening.sql` and `qr_codes_token_idx` are applied.

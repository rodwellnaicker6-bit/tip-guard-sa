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

## Indexes

If p95 > 200ms, confirm indexes from `20260625160000_launch_qr_hardening.sql` and `qr_codes_token_idx` are applied.

# Demo environment

## Seed

```bash
npm run seed:demo
```

Creates staging users (`*@tipguard.staging`), demo merchant, guard, QR token `demo-staging-qr-01`, sample tips.

Requires `.env` with `VITE_SUPABASE_*` and `SUPABASE_SERVICE_ROLE_KEY`.

## Reset

```bash
npm run reset:demo
```

## Presentation mode

Set `VITE_DEMO_MODE=true` in `.env` for UI hints (see README). Do **not** enable on production.

## Verify

```bash
npm run verify:supabase
npm run verify:paystack
```

## QR smoke test

```bash
npx tsx scripts/stress-qr-resolve.ts demo-staging-qr-01 20
```

Or follow [STRESS_TEST.md](./STRESS_TEST.md).

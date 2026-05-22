# Release branch policy (TipGuard SA)

## Protected branch: `main`

- `main` is the **production** line (Vercel Production deploys from `main`).
- **No force push** to `main` — use revert commits or a forward fix branch.
- PRs to `main` require green `npm run build`, `lint`, `verify:supabase`, `verify:paystack` before merge.
- Database changes: migrations in `supabase/migrations/` only; apply with `supabase db push` per [SUPABASE_DEPLOY.md](./SUPABASE_DEPLOY.md).

## Hotfix workflow

1. Branch from latest `main`: `hotfix/<short-description>` (e.g. `hotfix/webhook-dlq-claim`).
2. Minimal fix + docs if operator-facing.
3. PR → merge to `main` → Vercel auto-deploy.
4. Edge secrets unchanged unless the hotfix requires rotation ([LIVE_KEY_CUTOVER.md](./LIVE_KEY_CUTOVER.md)).

## Feature work

- Use `feat/<name>` or `fix/<name>` branches; squash or merge per team preference.
- Do not long-lived diverge from `main` during beta — invite-only scope stays small.

## Tags & releases

- Optional git tag `vYYYY.MM.DD` on `main` after live-key cutover smoke passes.
- Document tag in [DEPLOYMENT_FINAL.md](./DEPLOYMENT_FINAL.md) when used.

## Rollback

- App: Vercel **Instant Rollback** to previous deployment ([ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)).
- Keys: revert `pk_live_` / `sk_live_` in Vercel + Supabase secrets together — never mix test/live.
- DB: forward migration only; no `db reset` on production.

## CI expectations

```bash
npm run build && npm run lint && npm run verify:supabase && npm run verify:paystack
```

Run before every push to `main` during beta.

# Daily backup verification (TipGuard SA)

## Supabase backups

On **Pro** (or higher) plans:

- **Daily backups** — automatic; retention per plan.
- **Point-in-time recovery (PITR)** — enable in Dashboard → **Database** → **Backups** if available for your region.

Free tier: rely on manual exports before risky migrations; upgrade before production go-live.

## Weekly checklist (operator)

- [ ] Confirm backups enabled in Supabase Dashboard → **Database** → **Backups**
- [ ] Note latest backup timestamp and retention window
- [ ] If PITR: confirm recovery window meets RPO (e.g. 7 days)
- [ ] Export a **sanity snapshot** monthly: `pg_dump` schema-only or Supabase CLI dump for critical tables (`transactions`, `tips`, `wallet_accounts`, `payment_events`)

## Manual verify (staging or clone project)

1. Create a **branch** or restore to a new project from backup (Supabase branching / restore wizard).
2. Run `npm run verify:supabase` against the restored project URL.
3. Spot-check row counts:

```sql
select count(*) from public.transactions;
select count(*) from public.payment_events;
select count(*) from public.tips where status = 'succeeded';
```

4. Delete test restore project when done to avoid duplicate webhook endpoints.

## Before destructive change

- [ ] Pause Paystack webhooks or enable [maintenance mode](./ROLLBACK_PLAN.md#5-emergency-maintenance-while-investigating)
- [ ] Document migration name and operator
- [ ] Confirm backup < 24h old

## Related

- [ROLLBACK_PLAN.md](./ROLLBACK_PLAN.md)
- [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md)

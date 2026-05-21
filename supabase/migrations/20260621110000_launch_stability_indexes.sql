-- TipGuard SA — launch stability: hot-path indexes for settlement dashboards and ops queries.
-- Safe additive migration; no RLS changes.

create index if not exists tips_status_created_idx
  on public.tips (status, created_at desc);

create index if not exists transactions_status_created_idx
  on public.transactions (status, created_at desc);

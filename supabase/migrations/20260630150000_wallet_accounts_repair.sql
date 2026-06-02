-- Repair: wallet_accounts missing on some production projects (finalize_tip depends on it)

create table if not exists public.wallet_accounts (
  guard_id uuid primary key references public.guards (id) on delete cascade,
  available_cents bigint not null default 0 check (available_cents >= 0),
  pending_cents bigint not null default 0 check (pending_cents >= 0),
  updated_at timestamptz not null default now()
);

alter table public.wallet_accounts enable row level security;

drop policy if exists "wallet_accounts_select_own_guard" on public.wallet_accounts;
create policy "wallet_accounts_select_own_guard"
  on public.wallet_accounts for select
  to authenticated
  using (
    exists (select 1 from public.guards g where g.id = wallet_accounts.guard_id and g.user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "wallet_accounts_admin_all" on public.wallet_accounts;
create policy "wallet_accounts_admin_all"
  on public.wallet_accounts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.wallet_accounts (guard_id, available_cents, pending_cents)
select g.id, greatest(g.balance_cents, 0), 0
from public.guards g
on conflict (guard_id) do update
set available_cents = greatest(public.wallet_accounts.available_cents, excluded.available_cents);

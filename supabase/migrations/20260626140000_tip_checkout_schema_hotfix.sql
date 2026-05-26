-- Hotfix: columns/RPCs required by paystack-initialize on projects that skipped 20260622100000 / 20260624140000.

alter table public.tips
  add column if not exists payment_provider text not null default 'paystack',
  add column if not exists location_id uuid,
  add column if not exists qr_code_id uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.transactions
  add column if not exists commission_cents int,
  add column if not exists payer_device_hash text,
  add column if not exists guard_id uuid,
  add column if not exists payment_provider text not null default 'paystack',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  fee_bps int not null default 250,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, fee_bps)
values (1, 250)
on conflict (id) do nothing;

create or replace function public.get_platform_fee_bps()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select fee_bps from public.platform_settings where id = 1), 250);
$$;

revoke all on function public.get_platform_fee_bps() from public;
grant execute on function public.get_platform_fee_bps() to anon, authenticated, service_role;

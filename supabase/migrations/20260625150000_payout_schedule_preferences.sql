-- Guard and merchant payout schedule preferences (instant / daily / weekly / monthly)

alter table public.guards
  add column if not exists payout_schedule text not null default 'weekly',
  add column if not exists next_payout_at timestamptz,
  add column if not exists minimum_payout_threshold_cents bigint not null default 10000;

alter table public.guards drop constraint if exists guards_payout_schedule_check;
alter table public.guards
  add constraint guards_payout_schedule_check
  check (payout_schedule in ('instant', 'daily', 'weekly', 'monthly'));

alter table public.merchants
  add column if not exists payout_schedule text not null default 'weekly',
  add column if not exists next_payout_at timestamptz,
  add column if not exists minimum_payout_threshold_cents bigint not null default 10000;

alter table public.merchants drop constraint if exists merchants_payout_schedule_check;
alter table public.merchants
  add constraint merchants_payout_schedule_check
  check (payout_schedule in ('instant', 'daily', 'weekly', 'monthly'));

comment on column public.guards.payout_schedule is 'Preferred payout cadence for guard tip settlements.';
comment on column public.merchants.payout_schedule is 'Preferred payout cadence for venue settlement batches.';

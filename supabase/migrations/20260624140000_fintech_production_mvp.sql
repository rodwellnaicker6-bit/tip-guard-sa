-- TipGuard SA — Fintech production MVP: wallet splits, platform fee, venues alias, merchant analytics v2

-- ── Platform commission (basis points; 250 = 2.5%) ───────────────────────────
create table if not exists public.platform_settings (
  id int primary key default 1 check (id = 1),
  fee_bps int not null default 250 check (fee_bps >= 0 and fee_bps <= 5000),
  commission_cents_floor int not null default 0 check (commission_cents_floor >= 0),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, fee_bps)
values (1, 250)
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

create policy "platform_settings_select_authenticated"
  on public.platform_settings for select
  to authenticated, anon
  using (true);

create policy "platform_settings_admin_write"
  on public.platform_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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

-- ── Guard wallet ledger (available vs pending payout holds) ───────────────────
create table if not exists public.wallet_accounts (
  guard_id uuid primary key references public.guards (id) on delete cascade,
  available_cents bigint not null default 0 check (available_cents >= 0),
  pending_cents bigint not null default 0 check (pending_cents >= 0),
  updated_at timestamptz not null default now()
);

alter table public.wallet_accounts enable row level security;

create policy "wallet_accounts_select_own_guard"
  on public.wallet_accounts for select
  to authenticated
  using (
    exists (select 1 from public.guards g where g.id = wallet_accounts.guard_id and g.user_id = auth.uid())
    or public.is_admin()
  );

create policy "wallet_accounts_admin_all"
  on public.wallet_accounts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Backfill from legacy balance_cents
insert into public.wallet_accounts (guard_id, available_cents, pending_cents)
select g.id, greatest(g.balance_cents, 0), 0
from public.guards g
on conflict (guard_id) do update
set available_cents = greatest(public.wallet_accounts.available_cents, excluded.available_cents);

-- ── Tips: commission audit ────────────────────────────────────────────────────
alter table public.tips
  add column if not exists commission_cents int,
  add column if not exists net_amount_cents int,
  add column if not exists payer_device_hash text;

alter table public.transactions
  add column if not exists commission_cents int,
  add column if not exists payer_device_hash text;

alter table public.payout_requests
  add column if not exists guard_id uuid references public.guards (id) on delete set null,
  add column if not exists provider_reference text,
  add column if not exists updated_at timestamptz not null default now();

-- Venues alias (merchants are venue operators in product copy)
create or replace view public.venues as
select
  m.id,
  m.user_id,
  m.business_name as name,
  m.location,
  m.verified,
  m.created_at
from public.merchants m;

grant select on public.venues to authenticated, anon;

-- ── Finalize tip with platform fee + wallet_accounts credit ───────────────────
create or replace function public.finalize_tip_from_paystack_reference(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee_bps int;
  v_commission int;
  v_net int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'finalize_tip_from_paystack_reference is service_role only';
  end if;

  v_fee_bps := public.get_platform_fee_bps();

  with updated as (
    update public.tips t
    set
      status = 'succeeded',
      commission_cents = coalesce(
        t.commission_cents,
        greatest(0, round(t.amount_cents::numeric * v_fee_bps / 10000.0)::int)
      ),
      net_amount_cents = coalesce(
        t.net_amount_cents,
        t.amount_cents - greatest(0, round(t.amount_cents::numeric * v_fee_bps / 10000.0)::int)
      )
    where t.paystack_reference = p_reference
      and t.status = 'pending'
    returning id, guard_id, amount_cents, commission_cents, net_amount_cents
  ),
  nets as (
    select u.*, coalesce(u.net_amount_cents, u.amount_cents - coalesce(u.commission_cents, 0)) as credit_cents
    from updated u
  )
  update public.guards g
  set
    tips_count = g.tips_count + 1,
    balance_cents = g.balance_cents + n.credit_cents
  from nets n
  where g.id = n.guard_id;

  insert into public.wallet_accounts (guard_id, available_cents, pending_cents)
  select n.guard_id, n.credit_cents, 0
  from (
    select guard_id, coalesce(net_amount_cents, amount_cents - coalesce(commission_cents, 0)) as credit_cents
    from public.tips
    where paystack_reference = p_reference and status = 'succeeded'
  ) n
  on conflict (guard_id) do update
  set
    available_cents = public.wallet_accounts.available_cents + excluded.available_cents,
    updated_at = now();
end;
$$;

-- Hold funds when guard requests payout
create or replace function public.hold_guard_payout(p_guard_id uuid, p_amount_cents bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avail bigint;
begin
  if auth.role() is distinct from 'service_role' and auth.uid() is distinct from (
    select user_id from public.guards where id = p_guard_id
  ) then
    raise exception 'forbidden';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return false;
  end if;

  insert into public.wallet_accounts (guard_id, available_cents, pending_cents)
  select p_guard_id, greatest(g.balance_cents, 0), 0
  from public.guards g where g.id = p_guard_id
  on conflict (guard_id) do nothing;

  select available_cents into v_avail from public.wallet_accounts where guard_id = p_guard_id for update;
  if coalesce(v_avail, 0) < p_amount_cents then
    return false;
  end if;

  update public.wallet_accounts
  set
    available_cents = available_cents - p_amount_cents,
    pending_cents = pending_cents + p_amount_cents,
    updated_at = now()
  where guard_id = p_guard_id;

  update public.guards
  set balance_cents = greatest(0, balance_cents - p_amount_cents)
  where id = p_guard_id;

  return true;
end;
$$;

revoke all on function public.hold_guard_payout(uuid, bigint) from public;
grant execute on function public.hold_guard_payout(uuid, bigint) to authenticated, service_role;

-- Merchant analytics with period filter + live feed slice
create or replace function public.merchant_payment_analytics_v2(p_period text default '30d')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid;
  v_since timestamptz;
  v_result jsonb;
begin
  select m.id into v_mid from public.merchants m where m.user_id = auth.uid() limit 1;
  if v_mid is null then
    raise exception 'merchant profile required';
  end if;

  v_since := case lower(trim(coalesce(p_period, '30d')))
    when '7d' then now() - interval '7 days'
    when '24h' then now() - interval '24 hours'
    when 'all' then '1970-01-01'::timestamptz
    else now() - interval '30 days'
  end;

  select jsonb_build_object(
    'period', p_period,
    'since', v_since,
    'tips_succeeded', (
      select count(*)::bigint from public.tips t
      join public.guards g on g.id = t.guard_id
      where g.merchant_id = v_mid and t.status = 'succeeded' and t.created_at >= v_since
    ),
    'volume_cents_succeeded', (
      select coalesce(sum(t.amount_cents), 0)::bigint from public.tips t
      join public.guards g on g.id = t.guard_id
      where g.merchant_id = v_mid and t.status = 'succeeded' and t.created_at >= v_since
    ),
    'commission_cents', (
      select coalesce(sum(t.commission_cents), 0)::bigint from public.tips t
      join public.guards g on g.id = t.guard_id
      where g.merchant_id = v_mid and t.status = 'succeeded' and t.created_at >= v_since
    ),
    'guards_count', (select count(*)::bigint from public.guards where merchant_id = v_mid),
    'locations_count', (select count(*)::bigint from public.merchant_locations where merchant_id = v_mid and active),
    'guard_leaderboard', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select g.display_name as name, count(t.id)::bigint as tip_count,
               coalesce(sum(t.amount_cents), 0)::bigint as volume_cents
        from public.tips t
        join public.guards g on g.id = t.guard_id
        where g.merchant_id = v_mid and t.status = 'succeeded' and t.created_at >= v_since
        group by g.id, g.display_name
        order by volume_cents desc
        limit 10
      ) x
    ),
    'live_feed', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select t.id, g.display_name as guard_name, t.amount_cents, t.status, t.created_at
        from public.tips t
        join public.guards g on g.id = t.guard_id
        where g.merchant_id = v_mid and t.created_at >= v_since
        order by t.created_at desc
        limit 20
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.merchant_payment_analytics_v2(text) from public;
grant execute on function public.merchant_payment_analytics_v2(text) to authenticated;

-- Guard earnings summary (onboarding / profile)
create or replace function public.guard_earnings_summary(p_guard_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gid uuid;
  v_uid uuid := auth.uid();
begin
  if p_guard_id is not null then
    v_gid := p_guard_id;
  else
    select g.id into v_gid from public.guards g where g.user_id = v_uid limit 1;
  end if;
  if v_gid is null then
    return '{}'::jsonb;
  end if;
  if not public.is_admin() and not exists (select 1 from public.guards g where g.id = v_gid and g.user_id = v_uid) then
    raise exception 'forbidden';
  end if;

  return jsonb_build_object(
    'guard_id', v_gid,
    'tips_succeeded', (select count(*)::bigint from public.tips where guard_id = v_gid and status = 'succeeded'),
    'volume_cents', (select coalesce(sum(amount_cents), 0)::bigint from public.tips where guard_id = v_gid and status = 'succeeded'),
    'available_cents', (select coalesce(w.available_cents, g.balance_cents, 0)::bigint from public.guards g left join public.wallet_accounts w on w.guard_id = g.id where g.id = v_gid),
    'pending_cents', (select coalesce(w.pending_cents, 0)::bigint from public.wallet_accounts w where w.guard_id = v_gid)
  );
end;
$$;

revoke all on function public.guard_earnings_summary(uuid) from public;
grant execute on function public.guard_earnings_summary(uuid) to authenticated;

-- RLS: guards may read own wallet row via join policy above; tips payer_device_hash not client-writable
create or replace function public.tips_protect_settlement_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status
      and auth.role() is distinct from 'service_role'
      and not public.is_admin()
    then
      raise exception 'tip status is server-managed';
    end if;
    if new.commission_cents is distinct from old.commission_cents
      or new.net_amount_cents is distinct from old.net_amount_cents
    then
      if auth.role() is distinct from 'service_role' and not public.is_admin() then
        new.commission_cents := old.commission_cents;
        new.net_amount_cents := old.net_amount_cents;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tips_protect_settlement_fields on public.tips;
create trigger tips_protect_settlement_fields
  before update on public.tips
  for each row execute function public.tips_protect_settlement_fields();

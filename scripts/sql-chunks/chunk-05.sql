stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'tips_succeeded', (select count(*)::bigint from public.tips where status = 'succeeded'),
    'tips_pending', (select count(*)::bigint from public.tips where status = 'pending'),
    'volume_cents_succeeded', (select coalesce(sum(amount_cents), 0)::bigint from public.tips where status = 'succeeded'),
    'guards_total', (select count(*)::bigint from public.guards),
    'guards_verified', (select count(*)::bigint from public.guards where verified = true),
    'merchants_total', (select count(*)::bigint from public.merchants),
    'merchants_verified', (select count(*)::bigint from public.merchants where verified = true),
    'referrals_total', (select count(*)::bigint from public.referrals),
    'referrals_qualified', (select count(*)::bigint from public.referrals where status in ('qualified', 'rewarded')),
    'loyalty_wallets', (select count(*)::bigint from public.loyalty_wallets),
    'loyalty_points_outstanding', (select coalesce(sum(points_balance), 0)::bigint from public.loyalty_wallets),
    'kyc_open', (select count(*)::bigint from public.kyc_cases where status in ('submitted', 'in_review')),
    'analytics_24h', (
      select count(*)::bigint from public.analytics_events ae
      where ae.created_at > now() - interval '24 hours'
    )
  );
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public;
grant execute on function public.admin_dashboard_metrics() to authenticated;


-- ### 20260621110000_launch_stability_indexes.sql
-- TipGuard SA — launch stability: hot-path indexes for settlement dashboards and ops queries.
-- Safe additive migration; no RLS changes.

create index if not exists tips_status_created_idx
  on public.tips (status, created_at desc);

create index if not exists transactions_status_created_idx
  on public.transactions (status, created_at desc);


-- ### 20260622100000_payment_qr_production.sql
-- =============================================================================
-- TipGuard SA — Payment + QR production schema (merchant locations, isolation, analytics)
-- Apply after 20260621110000_launch_stability_indexes.sql
-- =============================================================================

-- ── 1. Merchant locations (sites / precincts) ─────────────────────────────────
create table if not exists public.merchant_locations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  name text not null,
  address text,
  province text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchant_locations_merchant_idx
  on public.merchant_locations (merchant_id, active);

drop trigger if exists trg_merchant_locations_updated on public.merchant_locations;
create trigger trg_merchant_locations_updated
  before update on public.merchant_locations
  for each row execute function public.set_updated_at();

alter table public.merchant_locations enable row level security;

create policy "merchant_locations_select_own"
  on public.merchant_locations for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.merchants m
      where m.id = merchant_locations.merchant_id and m.user_id = auth.uid()
    )
  );

create policy "merchant_locations_insert_own"
  on public.merchant_locations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_locations.merchant_id and m.user_id = auth.uid()
    )
  );

create policy "merchant_locations_update_own"
  on public.merchant_locations for update
  to authenticated
  using (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_locations.merchant_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.merchants m
      where m.id = merchant_locations.merchant_id and m.user_id = auth.uid()
    )
  );

create policy "merchant_locations_admin_all"
  on public.merchant_locations for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 2. Guards ↔ merchant (workforce under a venue operator) ─────────────────
alter table public.guards
  add column if not exists merchant_id uuid references public.merchants (id) on delete set null,
  add column if not exists location_id uuid references public.merchant_locations (id) on delete set null;

create index if not exists guards_merchant_idx on public.guards (merchant_id);
create index if not exists guards_location_idx on public.guards (location_id);

-- Merchant may read/update guards they own (not financial columns — existing trigger)
create policy "guards_select_merchant_staff"
  on public.guards for select
  to authenticated
  using (
    merchant_id is not null
    and exists (
      select 1 from public.merchants m
      where m.id = guards.merchant_id and m.user_id = auth.uid()
    )
  );

create policy "guards_update_merchant_profile_fields"
  on public.guards for update
  to authenticated
  using (
    merchant_id is not null
    and exists (
      select 1 from public.merchants m
      where m.id = guards.merchant_id and m.user_id = auth.uid()
    )
  )
  with check (
    merchant_id is not null
    and exists (
      select 1 from public.merchants m
      where m.id = guards.merchant_id and m.user_id = auth.uid()
    )
  );

-- ── 3. QR codes ↔ location + optional default tip ─────────────────────────────
alter table public.qr_codes
  add column if not exists location_id uuid references public.merchant_locations (id) on delete set null,
  add column if not exists default_amount_cents int check (default_amount_cents is null or default_amount_cents > 0),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists qr_codes_location_idx on public.qr_codes (location_id);
create index if not exists qr_codes_token_idx on public.qr_codes (code_token);

drop trigger if exists trg_qr_codes_updated on public.qr_codes;
create trigger trg_qr_codes_updated
  before update on public.qr_codes
  for each row execute function public.set_updated_at();

-- Merchant staff: manage QR for their merchant or guards they employ
drop policy if exists "qr_codes_owner_rw" on public.qr_codes;
drop policy if exists "qr_codes_admin_all" on public.qr_codes;
drop policy if exists "qr_codes_merchant_staff" on public.qr_codes;
create policy "qr_codes_merchant_staff"
  on public.qr_codes for all
  to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.guards g where g.id = qr_codes.guard_id and g.user_id = auth.uid())
    or exists (select 1 from public.merchants m where m.id = qr_codes.merchant_id and m.user_id = auth.uid())
    or (
      qr_codes.guard_id is not null
      and exists (
        select 1 from public.guards g
        join public.merchants m on m.id = g.merchant_id
        where g.id = qr_codes.guard_id and m.user_id = auth.uid()
      )
    )
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.guards g where g.id = qr_codes.guard_id and g.user_id = auth.uid())
    or exists (select 1 from public.merchants m where m.id = qr_codes.merchant_id and m.user_id = auth.uid())
    or (
      qr_codes.guard_id is not null
      and exists (
        select 1 from public.guards g
        join public.merchants m on m.id = g.merchant_id
        where g.id = qr_codes.guard_id and m.user_id = auth.uid()
      )
    )
  );

-- ── 4. Tips / transactions: provider + QR audit fields ──────────────────────
alter table public.tips
  add column if not exists payment_provider text not null default 'paystack',
  add column if not exists location_id uuid references public.merchant_locations (id) on delete set null,
  add column if not exists qr_code_id uuid references public.qr_codes (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists tips_provider_status_idx
  on public.tips (payment_provider, status, created_at desc);

alter table public.transactions
  add column if not exists payment_provider text not null default 'paystack',
  add column if not exists guard_id uuid references public.guards (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- ── 5. Payment events (immutable provider audit — service_role writes) ────────
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('paystack', 'yoco', 'payfast', 'ozow', 'peach_payments')),
  provider_event_id text not null,
  event_type text not null,
  paystack_reference text,
  tip_id uuid references public.tips (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payment_events_provider_event_uidx unique (provider, provider_event_id)
);

create index if not exists payment_events_created_idx
  on public.payment_events (created_at desc);

create index if not exists payment_events_reference_idx
  on public.payment_events (paystack_reference)
  where paystack_reference is not null;

alter table public.payment_events enable row level security;

revoke insert, update, delete on public.payment_events from anon, authenticated;

create policy "payment_events_admin_select"
  on public.payment_events for select
  to authenticated
  using (public.is_admin());

create or replace function public.claim_provider_webhook_event(
  p_provider text,
  p_event_id text,
  p_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'claim_provider_webhook_event is service_role only';
  end if;
  insert into public.payment_events (provider, provider_event_id, event_type, status)
  values (p_provider, p_event_id, p_event_type, 'received')
  on conflict (provider, provider_event_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.claim_provider_webhook_event(text, text, text) from public;
grant execute on function public.claim_provider_webhook_event(text, text, text) to service_role;

-- ── 6. Resolve QR / tip link → target (guard, location, amounts) ─────────────
create or replace function public.resolve_tip_target(p_token text)
returns table (
  guard_id uuid,
  location_id uuid,
  merchant_id uuid,
  guard_display_name text,
  default_amount_cents int,
  scan_count int
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (select trim(p_token) as tok)
  (
    select
      g.id,
      coalesce(q.location_id, g.location_id),
      coalesce(q.merchant_id, g.merchant_id),
      g.display_name,
      q.default_amount_cents,
      coalesce(q.scan_count, 0)::int
    from v
    join public.qr_codes q on q.code_token = v.tok
    join public.guards g on g.id = q.guard_id
    where length(v.tok) >= 4 and g.verified = true
    limit 1
  )
  union all
  (
    select
      g.id,
      g.location_id,
      g.merchant_id,
      g.display_name,
      null::int,
      coalesce(tl.scan_count, 0)::int
    from v
    join public.tip_links tl on tl.token = v.tok
    join public.guards g on g.id = tl.guard_id
    where length(v.tok) >= 4
      and tl.expires_at > now()
      and g.verified = true
      and not exists (
        select 1 from public.qr_codes q2
        join public.guards g2 on g2.id = q2.guard_id
        where q2.code_token = v.tok and g2.verified = true
      )
    limit 1
  )
  limit 1;
$$;

revoke all on function public.resolve_tip_target(text) from public;
grant execute on function public.resolve_tip_target(text) to anon, authenticated;

-- ── 7. Admin payment analytics (single RPC for dashboard) ─────────────────────
create or replace function public.admin_payment_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'tips_succeeded', (select count(*)::bigint from public.tips where status = 'succeeded'),
    'tips_pending', (select count(*)::bigint from public.tips where status = 'pending'),
    'tips_failed', (select count(*)::bigint from public.tips where status = 'failed'),
    'volume_cents_succeeded', (select coalesce(sum(amount_cents), 0)::bigint from public.tips where status = 'succeeded'),
    'transactions_succeeded', (select count(*)::bigint from public.transactions where status = 'succeeded'),
    'transactions_failed', (select count(*)::bigint from public.transactions where status = 'failed'),
    'revenue_today_cents', (
      select coalesce(sum(amount_cents), 0)::bigint from public.tips
      where status = 'succeeded' and created_at >= date_trunc('day', now() at time zone 'Africa/Johannesburg')
    ),
    'revenue_week_cents', (
      select coalesce(sum(amount_cents), 0)::bigint from public.tips
      where status = 'succeeded'
        and created_at >= date_trunc('week', now() at time zone 'Africa/Johannesburg')
    ),
    'qr_scans_total', (
      select coalesce(sum(scan_count), 0)::bigint from public.tip_links
    ) + (
      select coalesce(sum(scan_count), 0)::bigint from public.qr_codes
    ),
    'top_guards', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select g.display_name as name, count(t.id)::bigint as tip_count, coalesce(sum(t.amount_cents), 0)::bigint as volume_cents
        from public.tips t
        join public.guards g on g.id = t.guard_id
        where t.status = 'succeeded'
        group by g.id, g.display_name
        order by volume_cents desc
        limit 10
      ) x
    ),
    'merchant_volume', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select m.business_name as name, count(t.id)::bigint as tip_count, coalesce(sum(t.amount_cents), 0)::bigint as volume_cents
        from public.tips t
        join public.guards g on g.id = t.guard_id
        join public.merchants m on m.id = g.merchant_id
        where t.status = 'succeeded' and g.merchant_id is not null
        group by m.id, m.business_name
        order by volume_cents desc
        limit 10
      ) x
    ),
    'daily_revenue', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select (created_at at time zone 'Africa/Johannesburg')::date as day,
               coalesce(sum(amount_cents), 0)::bigint as volume_cents,
               count(*)::bigint as tip_count
        from public.tips
        where status = 'succeeded'
          and created_at >= now() - interval '14 days'
        group by 1
        order by 1
      ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_payment_analytics() from public;
grant execute on function public.admin_payment_analytics() to authenticated;

-- Merchant-scoped analytics (own guards only)
create or replace function public.merchant_payment_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mid uuid;
  v_result jsonb;
begin
  select m.id into v_mid from public.merchants m where m.user_id = auth.uid() limit 1;
  if v_mid is null then
    raise exception 'merchant profile required';
  end if;

  select jsonb_build_object(
    'tips_succeeded', (
      select count(*)::bigint from public.tips t
      join public.guards g on g.id = t.guard_id
      where g.merchant_id = v_mid and t.status = 'succeeded'
    ),
    'volume_cents_succeeded', (
      select coalesce(sum(t.amount_cents), 0)::bigint from public.tips t
      join public.guards g on g.id = t.guard_id
      where g.merchant_id = v_mid and t.status = 'succeeded'
    ),
    'guards_count', (select count(*)::bigint from public.guards where merchant_id = v_mid),
    'locations_count', (select count(*)::bigint from public.merchant_locations where merchant_id = v_mid and active),
    'qr_scans', (
      select coalesce(sum(q.scan_count), 0)::bigint from public.qr_codes q
      where q.merchant_id = v_mid
        or q.guard_id in (select id from public.guards where merchant_id = v_mid)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.merchant_payment_analytics() from public;
grant execute on function public.merchant_payment_analytics() to authenticated;


-- ### 20260624120000_repair_core_schema.sql
-- Repair bootstrap for projects that applied later migrations without init (profiles/guards missing).
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE).

create extension if not exists pgcrypto;

-- ── profiles ─────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'customer',
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'guard', 'customer', 'merchant'));

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
-- ### 20250512000000_init.sql
-- TipGuard SA — core schema + RLS
-- Run with: supabase db push (or paste in SQL Editor)

create extension if not exists "pgcrypto";

-- Profiles mirror auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('guard', 'customer', 'admin')),
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.guards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null unique,
  display_name text not null,
  location text,
  province text,
  avatar_initials text,
  verified boolean not null default false,
  rating numeric(3,2) not null default 4.5,
  tips_count int not null default 0,
  balance_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid not null references public.guards (id) on delete restrict,
  payer_id uuid references auth.users (id) on delete set null,
  amount_cents int not null check (amount_cents > 0),
  stripe_payment_intent_id text not null unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists tips_guard_id_idx on public.tips (guard_id);
create index if not exists tips_payer_id_idx on public.tips (payer_id);

-- Atomically mark tip succeeded and credit guard (called from Edge webhook with service role)
create or replace function public.finalize_tip_from_payment_intent(p_intent_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with updated as (
    update public.tips
    set status = 'succeeded'
    where stripe_payment_intent_id = p_intent_id
      and status = 'pending'
    returning id, guard_id, amount_cents
  )
  update public.guards g
  set
    tips_count = g.tips_count + 1,
    balance_cents = g.balance_cents + u.amount_cents
  from updated u
  where g.id = u.guard_id;
end;
$$;

revoke all on function public.finalize_tip_from_payment_intent(text) from public;
grant execute on function public.finalize_tip_from_payment_intent(text) to service_role;

-- RLS
alter table public.profiles enable row level security;
alter table public.guards enable row level security;
alter table public.tips enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "guards_select_authenticated"
  on public.guards for select
  to authenticated
  using (true);

create policy "guards_select_public_verified"
  on public.guards for select
  to anon
  using (verified = true);

create policy "guards_insert_own"
  on public.guards for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "guards_update_own"
  on public.guards for update
  to authenticated
  using (auth.uid() = user_id);

create policy "tips_select_guard_or_payer"
  on public.tips for select
  to authenticated
  using (
    payer_id = auth.uid()
    or exists (select 1 from public.guards g where g.id = tips.guard_id and g.user_id = auth.uid())
  );

-- Inserts happen via service role in Edge Functions (bypass RLS). Optional: allow payer insert pending — skipped for security.

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'customer'),
    coalesce(
      new.raw_user_meta_data->>'full_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Member'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Demo guards (no linked user) for customer browse / QR tests
insert into public.guards (id, display_name, location, province, avatar_initials, verified, rating, tips_count, balance_cents)
values
  ('a0000001-0000-4000-8000-000000000001'::uuid, 'Sipho Dlamini', 'Metropolitan retail precinct, Gauteng', 'Gauteng', 'SD', true, 4.8, 178, 284050),
  ('a0000002-0000-4000-8000-000000000002'::uuid, 'Thabo Nkosi', 'V&A Waterfront, CPT', 'Western Cape', 'TN', true, 4.6, 92, 98000),
  ('a0000003-0000-4000-8000-000000000003'::uuid, 'Lungile Mokoena', 'Gateway, Umhlanga', 'KwaZulu-Natal', 'LM', true, 4.9, 312, 521075)
on conflict (id) do nothing;


-- ### 20250513000000_production.sql
-- TipGuard SA — production: RLS hardening, Connect fields, QR links, fraud, webhooks idempotency, realtime, storage

-- ── Helper: admin role ─────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── Public guard listing (no balance leak) ─────────────────────────
create or replace function public.list_public_guards()
returns table (
  id uuid,
  display_name text,
  location text,
  province text,
  avatar_initials text,
  verified boolean,
  rating numeric,
  tips_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.display_name,
    g.location,
    g.province,
    g.avatar_initials,
    g.verified,
    g.rating,
    g.tips_count
  from public.guards g
  where g.verified = true
  order by g.display_name;
$$;

revoke all on function public.list_public_guards() from public;
grant execute on function public.list_public_guards() to anon, authenticated;

create or replace function public.get_public_guard(p_id uuid)
returns table (
  id uuid,
  display_name text,
  location text,
  province text,
  avatar_initials text,
  verified boolean,
  rating numeric,
  tips_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    g.id,
    g.display_name,
    g.location,
    g.province,
    g.avatar_initials,
    g.verified,
    g.rating,
    g.tips_count
  from public.guards g
  where g.id = p_id and g.verified = true;
$$;

revoke all on function public.get_public_guard(uuid) from public;
grant execute on function public.get_public_guard(uuid) to anon, authenticated;

-- ── Guards: Connect + profile extras ───────────────────────────────
alter table public.guards
  add column if not exists bio text,
  add column if not exists photo_path text,
  add column if not exists work_hours text,
  add column if not exists stripe_account_id text,
  add column if not exists connect_charges_enabled boolean not null default false,
  add column if not exists connect_onboarding_status text not null default 'not_started';

-- ── QR tip links ───────────────────────────────────────────────────
create table if not exists public.tip_links (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid not null references public.guards (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '400 days'),
  created_at timestamptz not null default now()
);

create index if not exists tip_links_token_idx on public.tip_links (token);

alter table public.tip_links enable row level security;

create policy "tip_links_select_guard_or_admin"
  on public.tip_links for select
  to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.guards g where g.id = tip_links.guard_id and g.user_id = auth.uid())
  );

create policy "tip_links_insert_own_guard"
  on public.tip_links for insert
  to authenticated
  with check (
    exists (select 1 from public.guards g where g.id = tip_links.guard_id and g.user_id = auth.uid())
  );

create or replace function public.resolve_tip_link(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.guard_id
  from public.tip_links l
  where l.token = p_token
    and l.expires_at > now()
  limit 1;
$$;

revoke all on function public.resolve_tip_link(text) from public;
grant execute on function public.resolve_tip_link(text) to anon, authenticated;

-- ── Fraud + rate log (Edge Functions use service role to write) ───
create table if not exists public.fraud_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  guard_id uuid references public.guards (id) on delete set null,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fraud_events_created_idx on public.fraud_events (created_at desc);

alter table public.fraud_events enable row level security;

create policy "fraud_events_admin_select"
  on public.fraud_events for select
  to authenticated
  using (public.is_admin());

create table if not exists public.api_rate_log (
  id bigserial primary key,
  user_id uuid not null,
  route text not null,
  created_at timestamptz not null default now()
);

create index if not exists api_rate_log_user_route_time_idx
  on public.api_rate_log (user_id, route, created_at desc);

-- Service role only inserts (no RLS needed if never granted to anon — lock down)
alter table public.api_rate_log enable row level security;

-- ── Stripe webhook idempotency ──────────────────────────────────────
create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_webhook_events disable row level security;
alter table public.api_rate_log disable row level security;

-- ── Tips: platform fee column (optional audit) ─────────────────────
alter table public.tips
  add column if not exists application_fee_cents int not null default 0,
  add column if not exists stripe_charge_id text;

-- ── Replace loose guard SELECT policies ────────────────────────────
drop policy if exists "guards_select_authenticated" on public.guards;
drop policy if exists "guards_select_public_verified" on public.guards;

create policy "guards_select_own_or_admin"
  on public.guards for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "guards_admin_all"
  on public.guards for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "tips_admin_all"
  on public.tips for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_admin_select"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Fraud insert via Edge only — optional admin insert for tests
create policy "fraud_events_admin_insert"
  on public.fraud_events for insert
  to authenticated
  with check (public.is_admin());

-- ── Storage: guard photos ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('guard-photos', 'guard-photos', true)
on conflict (id) do nothing;

create policy "guard_photos_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'guard-photos');

create policy "guard_photos_owner_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'guard-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "guard_photos_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'guard-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "guard_photos_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'guard-photos'
    and split_part(name, '/', 1) = auth.uid()::text
  );

-- ── Realtime for tips ───────────────────────────────────────────────
alter table public.tips replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tips' and schemaname = 'public'
  ) then
    alter publication supabase_realtime add table public.tips;
  end if;
exception
  when undefined_object then null;
end $$;

-- ── Admin metrics RPC (auth checked) ───────────────────────────────
create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
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
    'guards_verified', (select count(*)::bigint from public.guards where verified = true)
  );
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public;
grant execute on function public.admin_dashboard_metrics() to authenticated;

-- ── Finalize tip credits net amount after platform fee ─────────────
create or replace function public.finalize_tip_from_payment_intent(p_intent_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with updated as (
    update public.tips
    set status = 'succeeded'
    where stripe_payment_intent_id = p_intent_id
      and status = 'pending'
    returning id, guard_id, (amount_cents - coalesce(application_fee_cents, 0)) as net_cents
  )
  update public.guards g
  set
    tips_count = g.tips_count + 1,
    balance_cents = g.balance_cents + u.net_cents
  from updated u
  where g.id = u.guard_id;
end;
$$;

revoke all on function public.finalize_tip_from_payment_intent(text) from public;
grant execute on function public.finalize_tip_from_payment_intent(text) to service_role;


-- ### 20260209000000_security_critical.sql
-- =============================================================================
-- TipGuard SA — critical security hardening (incremental migration)
-- =============================================================================
-- WHAT: RLS for internal-only tables, revoke client grants, safe profile roles,
--       guard financial/Connect field protection, stricter guard INSERT policy,
--       defense-in-depth on tips mutations, Stripe webhook lookup index.
-- WHY:  Production RLS previously allowed broad guard reads and left internal
--       webhook/rate tables without RLS; profiles trusted raw_user_meta_data
--       for role; clients could inflate balances or flip verification flags.
-- GUARD SIGNUP PATH (role is never taken from user-controlled metadata on
--       signup): auth trigger inserts profiles.role = 'customer' only. An
--       admin (authenticated + profiles.role = 'admin') updates the profile
--       to 'guard', or the same change is applied with the service_role key
--       from a trusted server path. The guard then completes GuardSetup.
-- =============================================================================

-- ── Stripe Connect: fast, safe lookup for account.updated webhooks ─────────
-- WHAT: Unique partial index on guards.stripe_account_id (non-null only).
-- WHY:  Webhook updates use .eq("stripe_account_id", acct.id); uniqueness
--       prevents two guards from sharing one Connect account by mistake.
CREATE UNIQUE INDEX IF NOT EXISTS guards_stripe_account_id_uidx
  ON public.guards (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- ── Auth signup: never trust raw_user_meta_data for privilege ───────────────
-- WHAT: Replace handle_new_user so new profiles always get role 'customer'.
-- WHY:  Client-supplied metadata must not create admin/guard accounts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    'customer',
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
      'Member'
    )
  );
  RETURN NEW;
END;
$$;

-- ── Profiles: default role on any non-admin client INSERT ──────────────────
-- WHAT: BEFORE INSERT trigger forcing role = customer unless service_role or
--       an authenticated admin is performing the insert.
-- WHY:  Defense in depth if profiles are inserted outside handle_new_user.
CREATE OR REPLACE FUNCTION public.profile_enforce_customer_role_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      NEW.role := 'customer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_enforce_customer_role_on_insert ON public.profiles;
CREATE TRIGGER profile_enforce_customer_role_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
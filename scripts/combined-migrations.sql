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
  execute function public.profile_enforce_customer_role_on_insert();

-- ── Profiles: block self-service role changes (escalation / lateral move) ──
-- WHAT: BEFORE UPDATE trigger; only service_role or is_admin() may change role.
-- WHY:  RLS allows users to update their own row for name/phone — not role.
CREATE OR REPLACE FUNCTION public.profile_prevent_client_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() = 'service_role' OR public.is_admin() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'profile role cannot be changed without admin or service role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_prevent_client_role_change ON public.profiles;
CREATE TRIGGER profile_prevent_client_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  execute function public.profile_prevent_client_role_change();

-- ── Guards: clients cannot forge balances, tips, verification, or Connect ──
-- WHAT: BEFORE INSERT OR UPDATE trigger locking server-owned columns unless
--       service_role or admin.
-- WHY:  RLS policies allowed guard owners to UPDATE any column; inserts could
--       set arbitrary balance_cents. Edge Functions use service_role and bypass
--       RLS but still pass this trigger with auth.role() = 'service_role'.
CREATE OR REPLACE FUNCTION public.guards_block_sensitive_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.balance_cents := 0;
    NEW.tips_count := 0;
    NEW.verified := FALSE;
    NEW.rating := LEAST(GREATEST(COALESCE(NEW.rating, 4.5), 0), 5);
    NEW.stripe_account_id := NULL;
    NEW.connect_charges_enabled := FALSE;
    NEW.connect_onboarding_status := COALESCE(NEW.connect_onboarding_status, 'not_started');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.balance_cents IS DISTINCT FROM OLD.balance_cents
      OR NEW.tips_count IS DISTINCT FROM OLD.tips_count
      OR NEW.verified IS DISTINCT FROM OLD.verified
      OR NEW.rating IS DISTINCT FROM OLD.rating
      OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
      OR NEW.connect_charges_enabled IS DISTINCT FROM OLD.connect_charges_enabled
      OR NEW.connect_onboarding_status IS DISTINCT FROM OLD.connect_onboarding_status
    THEN
      RAISE EXCEPTION 'cannot modify guard ledger, verification, rating, or Connect fields from the client';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guards_block_sensitive_client_mutations ON public.guards;
CREATE TRIGGER guards_block_sensitive_client_mutations
  BEFORE INSERT OR UPDATE ON public.guards
  FOR EACH ROW
  execute function public.guards_block_sensitive_client_mutations();

-- ── Guards INSERT policy: explicit WITH CHECK (RLS layer) ───────────────────
-- WHAT: Replace guards_insert_own with stricter WITH CHECK on financial defaults.
-- WHY:  Aligns RLS with triggers so misconfiguration does not allow forged rows.
DROP POLICY IF EXISTS "guards_insert_own" ON public.guards;

CREATE POLICY "guards_insert_own"
  ON public.guards FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND balance_cents = 0
    AND tips_count = 0
    AND verified = FALSE
    AND connect_charges_enabled = FALSE
    AND connect_onboarding_status = 'not_started'
    AND stripe_account_id IS NULL
  );

-- ── Tips: server-side writes only (RLS + trigger) ────────────────────────────
-- WHAT: BEFORE INSERT/UPDATE/DELETE on tips — allow only service_role or admin.
-- WHY:  Tips rows and status transitions must not be forged or deleted by anon
--       or normal customers; Edge Functions and webhooks use service_role.
CREATE OR REPLACE FUNCTION public.tips_require_privileged_writer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tips are managed server-side only';
END;
$$;

DROP TRIGGER IF EXISTS tips_require_privileged_writer ON public.tips;
CREATE TRIGGER tips_require_privileged_writer
  BEFORE INSERT OR UPDATE OR DELETE ON public.tips
  FOR EACH ROW
  execute function public.tips_require_privileged_writer();

-- ── Internal ops tables: RLS on + no REST access for anon/authenticated ─────
-- WHAT: Enable RLS on api_rate_log and stripe_webhook_events; revoke table
--       privileges from anon and authenticated roles.
-- WHY:  These tables are written only by Edge Functions (service_role), which
--       bypasses RLS; clients must not read or write webhook idempotency or
--       rate-limit rows through PostgREST.
ALTER TABLE public.api_rate_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_rate_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon, authenticated;


-- ### 20260210000000_customer_history.sql
-- Customer tip history without nested `guards` joins (avoids RLS on guards for payers).
-- RPC: security definer reads tips + guard display_name where payer_id = auth.uid().

create or replace function public.get_customer_tip_history()
returns table (
  id uuid,
  amount_cents int,
  status text,
  created_at timestamptz,
  guard_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.amount_cents,
    t.status,
    t.created_at,
    g.display_name as guard_display_name
  from public.tips t
  join public.guards g on g.id = t.guard_id
  where t.payer_id = auth.uid()
  order by t.created_at desc
  limit 100;
$$;

revoke all on function public.get_customer_tip_history() from public;
grant execute on function public.get_customer_tip_history() to authenticated;

comment on function public.get_customer_tip_history() is
  'Returns the authenticated customer''s tips with guard display names; avoids client-side joins into guards under stricter RLS.';


-- ### 20260210000001_wallet_stripe_payout.sql
-- Wallets (customer credits), Stripe customer id on profiles, payout requests,
-- atomic webhook event claim, and wallet credit RPC (service_role only).

-- ── Profiles: Stripe Customer id (written by Edge service_role only) ─────────
alter table public.profiles
  add column if not exists stripe_customer_id text unique;

create or replace function public.profile_protect_stripe_customer_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.stripe_customer_id is not null
      and auth.role() is distinct from 'service_role'
      and not public.is_admin()
    then
      raise exception 'stripe_customer_id cannot be set from the client';
    end if;
    return new;
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id then
    if auth.role() = 'service_role' or public.is_admin() then
      return new;
    end if;
    raise exception 'stripe_customer_id cannot be changed from the client';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_protect_stripe_customer_id on public.profiles;
create trigger profile_protect_stripe_customer_id
  before update on public.profiles
  for each row
  execute function public.profile_protect_stripe_customer_id();

-- ── Customer wallet ledger (writes via service_role / RPC only) ──────────────
create table if not exists public.customer_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  updated_at timestamptz not null default now()
);

alter table public.customer_wallets enable row level security;

create policy "customer_wallets_select_own"
  on public.customer_wallets for select
  to authenticated
  using (auth.uid() = user_id);

-- Credit wallet from Stripe webhook (service_role only).
create or replace function public.credit_wallet(p_user_id uuid, p_amount_cents bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'credit_wallet is service_role only';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return;
  end if;
  insert into public.customer_wallets (user_id, balance_cents, updated_at)
  values (p_user_id, p_amount_cents, now())
  on conflict (user_id) do update
  set
    balance_cents = public.customer_wallets.balance_cents + excluded.balance_cents,
    updated_at = now();
end;
$$;

revoke all on function public.credit_wallet(uuid, bigint) from public;
grant execute on function public.credit_wallet(uuid, bigint) to service_role;

-- ── Payout requests (guards): client may insert/read own; processing is Edge ───
create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists payout_requests_user_created_idx
  on public.payout_requests (user_id, created_at desc);

alter table public.payout_requests enable row level security;

create policy "payout_requests_select_own"
  on public.payout_requests for select
  to authenticated
  using (auth.uid() = user_id);

create policy "payout_requests_insert_own"
  on public.payout_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ── Atomic webhook idempotency claim (insert-first) ─────────────────────────
create or replace function public.claim_stripe_webhook_event(p_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'claim_stripe_webhook_event is service_role only';
  end if;
  insert into public.stripe_webhook_events (id, type)
  values (p_id, p_type)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text) from public;
grant execute on function public.claim_stripe_webhook_event(text, text) to service_role;

comment on function public.claim_stripe_webhook_event(text, text) is
  'Inserts webhook event id if missing; returns true when this invocation claimed the row (safe to process side effects).';


-- ### 20260211000000_paystack_replace_stripe.sql
-- TipGuard SA — Replace Stripe with Paystack (ZAR): schema, idempotency, finalize RPCs,
-- transactions + subscriptions, remove Connect/Stripe columns (IF EXISTS / safe drops).

-- ── Paystack webhook idempotency (replaces stripe_webhook_events) ─────────────
create table if not exists public.paystack_webhook_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.paystack_webhook_events enable row level security;

revoke all on table public.paystack_webhook_events from anon, authenticated;

create or replace function public.claim_paystack_webhook_event(p_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'claim_paystack_webhook_event is service_role only';
  end if;
  insert into public.paystack_webhook_events (id, type)
  values (p_id, p_type)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.claim_paystack_webhook_event(text, text) from public;
grant execute on function public.claim_paystack_webhook_event(text, text) to service_role;

comment on function public.claim_paystack_webhook_event(text, text) is
  'Inserts Paystack webhook event id if missing; returns true when this invocation claimed the row.';

-- ── Transactions ledger (Edge writes via service_role) ───────────────────────
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('tip', 'wallet_topup', 'subscription')),
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'ZAR',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  paystack_reference text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

alter table public.transactions enable row level security;

create policy "transactions_select_own"
  on public.transactions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "transactions_admin_select"
  on public.transactions for select
  to authenticated
  using (public.is_admin());

-- ── Subscriptions (minimal; Paystack plan codes from dashboard) ──────────────
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_code text not null,
  paystack_subscription_code text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

create unique index if not exists subscriptions_user_plan_uidx
  on public.subscriptions (user_id, plan_code);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "subscriptions_admin_select"
  on public.subscriptions for select
  to authenticated
  using (public.is_admin());

-- ── Tips: Paystack columns; drop Stripe payment identifiers ───────────────────
alter table public.tips
  add column if not exists paystack_reference text,
  add column if not exists paystack_access_code text;

alter table public.tips drop constraint if exists tips_stripe_payment_intent_id_key;
alter table public.tips drop constraint if exists tips_paystack_reference_key;

alter table public.tips drop column if exists stripe_payment_intent_id;
alter table public.tips drop column if exists stripe_charge_id;
alter table public.tips drop column if exists application_fee_cents;

create unique index if not exists tips_paystack_reference_uidx
  on public.tips (paystack_reference)
  where paystack_reference is not null;

-- ── Finalize tip by Paystack transaction reference (webhook / charge.success) ─
create or replace function public.finalize_tip_from_paystack_reference(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with updated as (
    update public.tips
    set status = 'succeeded'
    where paystack_reference = p_reference
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

revoke all on function public.finalize_tip_from_paystack_reference(text) from public;
grant execute on function public.finalize_tip_from_paystack_reference(text) to service_role;

drop function if exists public.finalize_tip_from_payment_intent(text);

-- ── Profiles: Paystack customer code (server-owned) ───────────────────────────
alter table public.profiles
  add column if not exists paystack_customer_code text;

drop trigger if exists profile_protect_stripe_customer_id on public.profiles;
drop function if exists public.profile_protect_stripe_customer_id();

alter table public.profiles drop column if exists stripe_customer_id;

create or replace function public.profile_protect_paystack_customer_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.paystack_customer_code is not null
      and auth.role() is distinct from 'service_role'
      and not public.is_admin()
    then
      raise exception 'paystack_customer_code cannot be set from the client';
    end if;
    return new;
  end if;
  if new.paystack_customer_code is distinct from old.paystack_customer_code then
    if auth.role() = 'service_role' or public.is_admin() then
      return new;
    end if;
    raise exception 'paystack_customer_code cannot be changed from the client';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_protect_paystack_customer_code on public.profiles;
create trigger profile_protect_paystack_customer_code
  before insert or update on public.profiles
  for each row
  execute function public.profile_protect_paystack_customer_code();

-- ── Guards: remove Stripe Connect columns + tighten INSERT policy ─────────────
drop policy if exists "guards_insert_own" on public.guards;

drop index if exists public.guards_stripe_account_id_uidx;

alter table public.guards drop column if exists stripe_account_id;
alter table public.guards drop column if exists connect_charges_enabled;
alter table public.guards drop column if exists connect_onboarding_status;

create or replace function public.guards_block_sensitive_client_mutations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.balance_cents := 0;
    new.tips_count := 0;
    new.verified := false;
    new.rating := least(greatest(coalesce(new.rating, 4.5), 0), 5);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.balance_cents is distinct from old.balance_cents
      or new.tips_count is distinct from old.tips_count
      or new.verified is distinct from old.verified
      or new.rating is distinct from old.rating
    then
      raise exception 'cannot modify guard ledger, verification, or rating from the client';
    end if;
  end if;

  return new;
end;
$$;

create policy "guards_insert_own"
  on public.guards for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and balance_cents = 0
    and tips_count = 0
    and verified = false
  );

-- ── Drop Stripe webhook artifacts ─────────────────────────────────────────────
drop function if exists public.claim_stripe_webhook_event(text, text);
drop table if exists public.stripe_webhook_events;

-- RLS parity: paystack_webhook_events locked down (service_role bypasses RLS)
alter table public.paystack_webhook_events enable row level security;


-- ### 20260512120000_neutralize_seed_guard_location.sql
-- Neutralize legacy demo locality label in seed guard row (additive, idempotent).
update public.guards
set location = 'Metropolitan retail precinct, Gauteng'
where id = 'a0000001-0000-4000-8000-000000000001'
  and location = 'Sandton City, JHB';


-- ### 20260615100000_tipguard_rbac_extension.sql
-- TipGuard SA — RBAC extension: merchant role, customers/merchants, QR/RFID, views, activity log
-- Apply after existing migrations. Does not drop legacy tables (tips, tip_links, payout_requests).

-- ── 1. profiles.role: add merchant ───────────────────────────────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'guard', 'customer', 'merchant'));

-- ── 2. customers (one row per auth user in customer journey) ─────────────────
create table if not exists public.customers (
  id uuid primary key references auth.users (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_created_idx on public.customers (created_at desc);

alter table public.customers enable row level security;

create policy "customers_select_own"
  on public.customers for select
  to authenticated
  using (auth.uid() = id);

create policy "customers_update_own"
  on public.customers for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "customers_admin_all"
  on public.customers for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Auto-create customer row when a profile is inserted (role starts as customer).
create or replace function public.on_profile_insert_customer_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customers (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_profile_insert_customer on public.profiles;
create trigger trg_profile_insert_customer
  after insert on public.profiles
  for each row execute function public.on_profile_insert_customer_row();

-- ── 3. merchants ─────────────────────────────────────────────────────────────
create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  business_name text not null default '',
  location text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists merchants_user_idx on public.merchants (user_id);

alter table public.merchants enable row level security;

create policy "merchants_select_own"
  on public.merchants for select
  to authenticated
  using (auth.uid() = user_id);

create policy "merchants_update_own"
  on public.merchants for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "merchants_insert_own"
  on public.merchants for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "merchants_admin_all"
  on public.merchants for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 4. qr_codes (tip deep links; token aligns with tip_links.token when used together) ──
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid references public.guards (id) on delete cascade,
  merchant_id uuid references public.merchants (id) on delete cascade,
  code_token text not null unique,
  label text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint qr_codes_owner_chk check (
    (guard_id is not null and merchant_id is null)
    or (guard_id is null and merchant_id is not null)
  )
);

create index if not exists qr_codes_guard_idx on public.qr_codes (guard_id);
create index if not exists qr_codes_merchant_idx on public.qr_codes (merchant_id);

alter table public.qr_codes enable row level security;

create policy "qr_codes_owner_rw"
  on public.qr_codes for all
  to authenticated
  using (
    exists (select 1 from public.guards g where g.id = qr_codes.guard_id and g.user_id = auth.uid())
    or exists (select 1 from public.merchants m where m.id = qr_codes.merchant_id and m.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.guards g where g.id = qr_codes.guard_id and g.user_id = auth.uid())
    or exists (select 1 from public.merchants m where m.id = qr_codes.merchant_id and m.user_id = auth.uid())
  );

create policy "qr_codes_admin_all"
  on public.qr_codes for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 5. rfid_tags ────────────────────────────────────────────────────────────
create table if not exists public.rfid_tags (
  id uuid primary key default gen_random_uuid(),
  tag_uid text not null unique,
  guard_id uuid references public.guards (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'revoked', 'lost')),
  created_at timestamptz not null default now()
);

alter table public.rfid_tags enable row level security;

create policy "rfid_guard_owner"
  on public.rfid_tags for all
  to authenticated
  using (
    guard_id is not null
    and exists (select 1 from public.guards g where g.id = rfid_tags.guard_id and g.user_id = auth.uid())
  )
  with check (
    guard_id is not null
    and exists (select 1 from public.guards g where g.id = rfid_tags.guard_id and g.user_id = auth.uid())
  );

create policy "rfid_admin_all"
  on public.rfid_tags for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 6. Unified tip ledger view (canonical read model over existing tips) ─────
create or replace view public.tip_transactions as
select
  t.id,
  t.payer_id as customer_user_id,
  t.guard_id,
  t.amount_cents,
  'ZAR'::text as currency,
  t.status,
  coalesce(t.paystack_reference, '') as provider_reference,
  'paystack'::text as provider,
  t.created_at
from public.tips t;

-- PostgREST: grant select where underlying tips RLS allows (invoker semantics)
grant select on public.tip_transactions to authenticated;

-- ── 7. payouts view over payout_requests ────────────────────────────────────
create or replace view public.payouts as
select
  pr.id,
  pr.user_id,
  pr.amount_cents,
  pr.status,
  pr.created_at
from public.payout_requests pr;

grant select on public.payouts to authenticated;

-- ── 8. activity_logs (audit; client read admin-only; writes via service_role) ─
create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_created_idx on public.activity_logs (created_at desc);

alter table public.activity_logs enable row level security;

revoke all on table public.activity_logs from anon;

create policy "activity_logs_admin_select"
  on public.activity_logs for select
  to authenticated
  using (public.is_admin());

-- ── 9. is_merchant() helper (profile role) ───────────────────────────────────
create or replace function public.is_merchant_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'merchant'
  );
$$;

revoke all on function public.is_merchant_profile() from public;
grant execute on function public.is_merchant_profile() to authenticated;

-- Backfill `customers` for profiles created before the profile→customer trigger existed.
insert into public.customers (id)
select p.id from public.profiles p
on conflict (id) do nothing;


-- ### 20260620120000_mvp_phase2_sessions_notifications.sql
-- TipGuard SA — Phase 2: tip checkout sessions, notifications, QR scan analytics, updated_at helpers
-- Safe to re-run: IF NOT EXISTS / CREATE OR REPLACE

-- ── Generic updated_at trigger ───────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── tip_sessions: checkout state before a row exists in tips ─────────────────
create table if not exists public.tip_sessions (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  source_link_token text,
  guard_id uuid not null references public.guards (id) on delete cascade,
  payer_id uuid references auth.users (id) on delete set null,
  amount_cents int check (amount_cents is null or amount_cents > 0),
  currency text not null default 'ZAR',
  status text not null default 'open' check (status in ('open', 'checkout', 'completed', 'expired', 'cancelled')),
  payment_provider text,
  tip_id uuid references public.tips (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tip_sessions_guard_idx on public.tip_sessions (guard_id, created_at desc);
create index if not exists tip_sessions_payer_idx on public.tip_sessions (payer_id, created_at desc);
create index if not exists tip_sessions_public_token_idx on public.tip_sessions (public_token);

drop trigger if exists trg_tip_sessions_updated on public.tip_sessions;
create trigger trg_tip_sessions_updated
  before update on public.tip_sessions
  for each row execute function public.set_updated_at();

alter table public.tip_sessions enable row level security;

create policy "tip_sessions_select_payer_or_guard_or_admin"
  on public.tip_sessions for select
  to authenticated
  using (
    public.is_admin()
    or payer_id = auth.uid()
    or exists (select 1 from public.guards g where g.id = tip_sessions.guard_id and g.user_id = auth.uid())
  );

create policy "tip_sessions_insert_authenticated"
  on public.tip_sessions for insert
  to authenticated
  with check (
    payer_id = auth.uid()
    and exists (select 1 from public.guards g where g.id = tip_sessions.guard_id and g.verified = true)
  );

create policy "tip_sessions_update_payer_or_guard_or_admin"
  on public.tip_sessions for update
  to authenticated
  using (
    public.is_admin()
    or payer_id = auth.uid()
    or exists (select 1 from public.guards g where g.id = tip_sessions.guard_id and g.user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or payer_id = auth.uid()
    or exists (select 1 from public.guards g where g.id = tip_sessions.guard_id and g.user_id = auth.uid())
  );

create policy "tip_sessions_admin_all"
  on public.tip_sessions for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── notifications (in-app; rows inserted via service_role / admin) ───────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'info' check (kind in ('info', 'tip', 'payout', 'system', 'fraud')),
  title text not null,
  body text,
  meta jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notifications_update_own_read"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notifications_admin_all"
  on public.notifications for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── tip_links scan analytics ───────────────────────────────────────────────────
alter table public.tip_links add column if not exists scan_count int not null default 0;
alter table public.tip_links add column if not exists last_scanned_at timestamptz;

create or replace function public.touch_tip_link(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.tip_links
  set
    scan_count = scan_count + 1,
    last_scanned_at = now()
  where token = p_token
    and expires_at > now();
end;
$$;

revoke all on function public.touch_tip_link(text) from public;
grant execute on function public.touch_tip_link(text) to anon, authenticated;

-- qr_codes analytics (if table exists from prior migration)
alter table public.qr_codes add column if not exists scan_count int not null default 0;
alter table public.qr_codes add column if not exists last_scanned_at timestamptz;

create or replace function public.touch_qr_code(p_code_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.qr_codes
  set
    scan_count = scan_count + 1,
    last_scanned_at = now()
  where code_token = p_code_token;
end;
$$;

revoke all on function public.touch_qr_code(text) from public;
grant execute on function public.touch_qr_code(text) to anon, authenticated;

-- ── Open tip session from verified guard (checkout prep) ─────────────────────
drop function if exists public.create_tip_session_for_guard(uuid, text);

create or replace function public.create_tip_session_for_guard(p_guard_id uuid, p_link_token text default null)
returns table (session_id uuid, public_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid;
  tok text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  if not exists (
    select 1 from public.guards g where g.id = p_guard_id and g.verified = true
  ) then
    raise exception 'guard not found or not verified';
  end if;

  insert into public.tip_sessions (guard_id, payer_id, source_link_token)
  values (p_guard_id, auth.uid(), nullif(trim(p_link_token), ''))
  returning id, tip_sessions.public_token into sid, tok;

  return query select sid, tok;
end;
$$;

revoke all on function public.create_tip_session_for_guard(uuid, text) from public;
grant execute on function public.create_tip_session_for_guard(uuid, text) to authenticated;

-- Admin: payout queue
drop policy if exists "payout_requests_admin_select" on public.payout_requests;
create policy "payout_requests_admin_select"
  on public.payout_requests for select
  to authenticated
  using (public.is_admin());

drop policy if exists "payout_requests_admin_update" on public.payout_requests;
create policy "payout_requests_admin_update"
  on public.payout_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());



-- ### 20260621100000_ecosystem_scaling_core.sql
-- =============================================================================
-- TipGuard SA — Ecosystem scaling core (production fintech substrate)
-- WHAT: Server-side loyalty + ledger, referrals, KYC case tracking, analytics
--       events, merchant financial/verification hardening, tip session payment
--       surface metadata, settlement post-hooks (loyalty + audit + analytics).
-- WHY:  Demo tables become an auditable, monetizable SA platform with hooks for
--       Apple/Google Pay surfaces, NFC/RFID prep, YieldCore-style downstream AI.
-- WHEN: Apply after 20260620120000_mvp_phase2_sessions_notifications.sql
-- =============================================================================

-- ── 1. Referral codes on profiles (immutable client-side; generated if empty) ─
alter table public.profiles add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_uidx
  on public.profiles (referral_code)
  where referral_code is not null;

create or replace function public.profiles_fill_referral_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cand text;
  tries int := 0;
begin
  if tg_op = 'INSERT' then
    if new.referral_code is not null and length(trim(new.referral_code)) > 0 then
      return new;
    end if;
    loop
      cand := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.profiles p where p.referral_code = cand);
      tries := tries + 1;
      exit when tries > 32;
    end loop;
    new.referral_code := cand;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_fill_referral_code on public.profiles;
create trigger trg_profiles_fill_referral_code
  before insert on public.profiles
  for each row
  execute function public.profiles_fill_referral_code();

-- Backfill existing profiles (best-effort unique codes)
do $$
declare
  r record;
  cand text;
  k int;
begin
  for r in select id from public.profiles where referral_code is null loop
    k := 0;
    loop
      cand := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.profiles p where p.referral_code = cand);
      k := k + 1;
      exit when k > 40;
    end loop;
    update public.profiles set referral_code = cand where id = r.id;
  end loop;
end $$;

create or replace function public.profile_protect_referral_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.referral_code is distinct from old.referral_code then
    if auth.role() = 'service_role' or public.is_admin() then
      return new;
    end if;
    raise exception 'referral_code cannot be changed from the client';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_referral_code on public.profiles;
create trigger trg_profiles_protect_referral_code
  before update on public.profiles
  for each row
  execute function public.profile_protect_referral_code();

-- ── 2. Referrals (one attribution per referee; rewards settled by ops / Edge) ─
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  referee_user_id uuid not null references auth.users (id) on delete cascade,
  referral_code_snapshot text not null,
  status text not null default 'pending'
    check (status in ('pending', 'qualified', 'rewarded', 'void')),
  qualified_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint referrals_referee_unique unique (referee_user_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id, created_at desc);

alter table public.referrals enable row level security;

create policy "referrals_select_referrer_or_referee"
  on public.referrals for select
  to authenticated
  using (auth.uid() = referrer_user_id or auth.uid() = referee_user_id);

create policy "referrals_admin_all"
  on public.referrals for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Service / Edge: attribute signup to a referrer by profile referral_code
create or replace function public.register_referral_attribution(p_referee_user_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_referrer uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'register_referral_attribution is service_role only';
  end if;
  if length(v_code) < 4 then
    return false;
  end if;
  select p.id into v_referrer
  from public.profiles p
  where p.referral_code = v_code
  limit 1;
  if v_referrer is null or v_referrer = p_referee_user_id then
    return false;
  end if;
  insert into public.referrals (referrer_user_id, referee_user_id, referral_code_snapshot, status)
  values (v_referrer, p_referee_user_id, v_code, 'pending')
  on conflict (referee_user_id) do nothing;
  return true;
end;
$$;

revoke all on function public.register_referral_attribution(uuid, text) from public;
grant execute on function public.register_referral_attribution(uuid, text) to service_role;

-- ── 3. Loyalty (server ledger; clients read-only) ────────────────────────────
create table if not exists public.loyalty_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  points_balance bigint not null default 0 check (points_balance >= 0),
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  current_streak int not null default 0 check (current_streak >= 0),
  last_tip_local_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta_points bigint not null,
  reason text not null,
  ref_tip_id uuid references public.tips (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_ledger_user_created_idx
  on public.loyalty_ledger (user_id, created_at desc);

create unique index if not exists loyalty_ledger_ref_tip_uidx
  on public.loyalty_ledger (ref_tip_id)
  where ref_tip_id is not null;

alter table public.loyalty_wallets enable row level security;
alter table public.loyalty_ledger enable row level security;

create policy "loyalty_wallets_select_own"
  on public.loyalty_wallets for select
  to authenticated
  using (auth.uid() = user_id);

create policy "loyalty_wallets_admin_select"
  on public.loyalty_wallets for select
  to authenticated
  using (public.is_admin());

create policy "loyalty_ledger_select_own"
  on public.loyalty_ledger for select
  to authenticated
  using (auth.uid() = user_id);

create policy "loyalty_ledger_admin_select"
  on public.loyalty_ledger for select
  to authenticated
  using (public.is_admin());

create or replace function public.apply_loyalty_for_successful_tip(p_payer_id uuid, p_tip_id uuid, p_amount_cents int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pts bigint;
  v_today date := (timezone('Africa/Johannesburg', now()))::date;
  v_prev date;
  v_streak int;
  v_bal bigint;
  v_tier text;
  v_ledger_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'apply_loyalty_for_successful_tip is service_role only';
  end if;
  if p_payer_id is null or p_amount_cents is null or p_amount_cents <= 0 then
    return;
  end if;
  perform pg_advisory_xact_lock(884422, hashtext(p_tip_id::text));
  v_pts := greatest(1::bigint, (p_amount_cents / 500)::bigint);

  insert into public.loyalty_wallets (user_id, points_balance, tier, current_streak, last_tip_local_date, updated_at)
  values (p_payer_id, 0, 'bronze', 0, null, now())
  on conflict (user_id) do nothing;

  begin
    insert into public.loyalty_ledger (user_id, delta_points, reason, ref_tip_id, meta)
    values (
      p_payer_id,
      v_pts,
      'tip_success',
      p_tip_id,
      '{}'::jsonb
    )
    returning id into v_ledger_id;
  exception
    when unique_violation then
      return;
  end;

  select last_tip_local_date, current_streak into v_prev, v_streak
  from public.loyalty_wallets where user_id = p_payer_id for update;

  if v_prev is null then
    v_streak := 1;
  elsif v_prev = v_today then
    null;
  elsif v_prev = v_today - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  update public.loyalty_wallets lw
  set
    points_balance = lw.points_balance + v_pts,
    current_streak = v_streak,
    last_tip_local_date = v_today,
    updated_at = now()
  where lw.user_id = p_payer_id
  returning lw.points_balance into v_bal;

  v_tier := case
    when v_bal >= 20000 then 'platinum'
    when v_bal >= 5000 then 'gold'
    when v_bal >= 1000 then 'silver'
    else 'bronze'
  end;

  update public.loyalty_wallets set tier = v_tier where user_id = p_payer_id;

  update public.loyalty_ledger
  set meta = jsonb_build_object('amount_cents', p_amount_cents, 'streak', v_streak, 'tier', v_tier)
  where id = v_ledger_id;
end;
$$;

revoke all on function public.apply_loyalty_for_successful_tip(uuid, uuid, int) from public;
grant execute on function public.apply_loyalty_for_successful_tip(uuid, uuid, int) to service_role;

-- ── 4. KYC / verification cases (workflow; documents live in Storage + meta) ───
create table if not exists public.kyc_cases (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('user', 'guard', 'merchant')),
  party_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'approved', 'rejected')),
  risk_score int not null default 0 check (risk_score >= 0 and risk_score <= 100),
  provider text,
  data jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kyc_cases_party_idx on public.kyc_cases (party_type, party_id);
create index if not exists kyc_cases_status_idx on public.kyc_cases (status, created_at desc);

drop trigger if exists trg_kyc_cases_updated on public.kyc_cases;
create trigger trg_kyc_cases_updated
  before update on public.kyc_cases
  for each row execute function public.set_updated_at();

alter table public.kyc_cases enable row level security;

create policy "kyc_select_admin"
  on public.kyc_cases for select
  to authenticated
  using (public.is_admin());

create policy "kyc_select_own_guard"
  on public.kyc_cases for select
  to authenticated
  using (
    party_type = 'guard'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  );

create policy "kyc_select_own_merchant"
  on public.kyc_cases for select
  to authenticated
  using (
    party_type = 'merchant'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  );

create policy "kyc_select_own_user"
  on public.kyc_cases for select
  to authenticated
  using (party_type = 'user' and party_id = auth.uid());

create policy "kyc_insert_own_guard_draft"
  on public.kyc_cases for insert
  to authenticated
  with check (
    party_type = 'guard'
    and status = 'draft'
    and exists (select 1 from public.guards g where g.id = party_id and g.user_id = auth.uid())
  );

create policy "kyc_insert_own_merchant_draft"
  on public.kyc_cases for insert
  to authenticated
  with check (
    party_type = 'merchant'
    and status = 'draft'
    and exists (select 1 from public.merchants m where m.id = party_id and m.user_id = auth.uid())
  );

create policy "kyc_update_own_guard_draft"
  on public.kyc_cases for update
  to authenticated
  using (
    party_type = 'guard'
    and status = 'draft'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  )
  with check (
    party_type = 'guard'
    and status = 'draft'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  );

create policy "kyc_guard_submit_for_review"
  on public.kyc_cases for update
  to authenticated
  using (
    party_type = 'guard'
    and status = 'draft'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  )
  with check (
    party_type = 'guard'
    and status = 'submitted'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  );

create policy "kyc_update_own_merchant_draft"
  on public.kyc_cases for update
  to authenticated
  using (
    party_type = 'merchant'
    and status = 'draft'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  )
  with check (
    party_type = 'merchant'
    and status = 'draft'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  );

create policy "kyc_merchant_submit_for_review"
  on public.kyc_cases for update
  to authenticated
  using (
    party_type = 'merchant'
    and status = 'draft'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  )
  with check (
    party_type = 'merchant'
    and status = 'submitted'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  );

create policy "kyc_admin_all"
  on public.kyc_cases for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 5. Analytics events (append-only; writers = service_role / Edge) ──────────
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  guard_id uuid references public.guards (id) on delete set null,
  merchant_id uuid references public.merchants (id) on delete set null,
  event text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event, created_at desc);

create index if not exists analytics_events_guard_created_idx
  on public.analytics_events (guard_id, created_at desc)
  where guard_id is not null;

alter table public.analytics_events enable row level security;

revoke insert, update, delete on public.analytics_events from anon, authenticated;

create policy "analytics_events_admin_select"
  on public.analytics_events for select
  to authenticated
  using (public.is_admin());

-- ── 6. Merchant onboarding + server-owned fields ─────────────────────────────
alter table public.merchants
  add column if not exists onboarding_stage text not null default 'draft'
    check (onboarding_stage in ('draft', 'submitted', 'under_review', 'approved', 'suspended')),
  add column if not exists company_registration text,
  add column if not exists vat_number text,
  add column if not exists paystack_subaccount_code text,
  add column if not exists settlement_notes text;

create or replace function public.merchants_block_sensitive_client_mutations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.verified := false;
    new.paystack_subaccount_code := null;
    new.onboarding_stage := 'draft';
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.verified is distinct from old.verified
      or new.paystack_subaccount_code is distinct from old.paystack_subaccount_code
    then
      raise exception 'merchant verification or Paystack subaccount cannot be changed from the client';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_merchants_block_sensitive on public.merchants;
create trigger trg_merchants_block_sensitive
  before insert or update on public.merchants
  for each row
  execute function public.merchants_block_sensitive_client_mutations();

-- Allow merchant to move draft → submitted once (client path for onboarding UX)
create or replace function public.merchant_submit_onboarding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.onboarding_stage is distinct from old.onboarding_stage then
    if old.onboarding_stage = 'draft'
      and new.onboarding_stage = 'submitted'
      and auth.uid() = old.user_id
    then
      return new;
    end if;
    raise exception 'invalid onboarding_stage transition';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_merchant_submit_onboarding on public.merchants;
create trigger trg_merchant_submit_onboarding
  before update on public.merchants
  for each row
  execute function public.merchant_submit_onboarding();

-- ── 7. Tip sessions: payment surface (QR / wallets / NFC prep) ─────────────────
alter table public.tip_sessions
  add column if not exists payment_surface text not null default 'web'
    check (payment_surface in ('web', 'qr', 'apple_pay', 'google_pay', 'nfc_preparing', 'rfid'));

comment on column public.tip_sessions.payment_surface is
  'Checkout entry surface: drives UX + future routing; NFC/RFID map to hardware flows.';

-- ── 8. Settlement hooks (loyalty + immutable audit + analytics) ────────────────
create or replace function public.post_tip_settlement_hooks(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tip public.tips%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'post_tip_settlement_hooks is service_role only';
  end if;

  select * into v_tip
  from public.tips
  where paystack_reference = p_reference and status = 'succeeded'
  limit 1;

  if not found then
    return;
  end if;

  if v_tip.payer_id is not null then
    perform public.apply_loyalty_for_successful_tip(v_tip.payer_id, v_tip.id, v_tip.amount_cents);
  end if;

  insert into public.analytics_events (user_id, guard_id, event, properties)
  values (
    v_tip.payer_id,
    v_tip.guard_id,
    'tip.settled',
    jsonb_build_object(
      'tip_id', v_tip.id,
      'amount_cents', v_tip.amount_cents,
      'reference', p_reference
    )
  );

  insert into public.activity_logs (user_id, action, entity_type, entity_id, meta)
  values (
    v_tip.payer_id,
    'tip_settled',
    'tip',
    v_tip.id::text,
    jsonb_build_object('paystack_reference', p_reference, 'amount_cents', v_tip.amount_cents)
  );
end;
$$;

revoke all on function public.post_tip_settlement_hooks(text) from public;
grant execute on function public.post_tip_settlement_hooks(text) to service_role;

-- ── 9. Admin KPIs (extend JSON; backward-compatible keys) ──────────────────────
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
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- ── guards ───────────────────────────────────────────────────────────────────
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

alter table public.guards enable row level security;

drop policy if exists "guards_select_authenticated" on public.guards;
create policy "guards_select_authenticated" on public.guards for select to authenticated using (true);

drop policy if exists "guards_select_public_verified" on public.guards;
create policy "guards_select_public_verified" on public.guards for select to anon using (verified = true);

-- ── tip_links (if missing) ───────────────────────────────────────────────────
create table if not exists public.tip_links (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid not null references public.guards (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '400 days'),
  scan_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tip_links enable row level security;

alter table public.tip_links add column if not exists last_scanned_at timestamptz;
alter table public.qr_codes add column if not exists last_scanned_at timestamptz;

-- ── is_admin + signup trigger ────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'customer',
    coalesce(new.raw_user_meta_data->>'full_name', nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── storage: guard photos ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('guard-photos', 'guard-photos', true)
on conflict (id) do nothing;

drop policy if exists "guard_photos_public_read" on storage.objects;
create policy "guard_photos_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'guard-photos');

-- ── RPCs used by app (minimal) ───────────────────────────────────────────────
create or replace function public.touch_tip_link(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tip_links set scan_count = scan_count + 1, last_scanned_at = now()
  where token = p_token and expires_at > now();
end;
$$;
grant execute on function public.touch_tip_link(text) to anon, authenticated;

create or replace function public.touch_qr_code(p_code_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.qr_codes set scan_count = scan_count + 1, last_scanned_at = now()
  where code_token = p_code_token;
end;
$$;
grant execute on function public.touch_qr_code(text) to anon, authenticated;

create or replace function public.list_public_guards()
returns table (
  id uuid, display_name text, location text, province text,
  avatar_initials text, verified boolean, rating numeric, tips_count int
) language sql stable security definer set search_path = public as $$
  select g.id, g.display_name, g.location, g.province, g.avatar_initials, g.verified, g.rating, g.tips_count
  from public.guards g where g.verified = true order by g.display_name;
$$;
grant execute on function public.list_public_guards() to anon, authenticated;

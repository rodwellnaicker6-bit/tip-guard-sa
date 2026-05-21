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
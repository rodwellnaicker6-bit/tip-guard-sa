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

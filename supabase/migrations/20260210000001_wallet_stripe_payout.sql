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

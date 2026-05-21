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

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

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

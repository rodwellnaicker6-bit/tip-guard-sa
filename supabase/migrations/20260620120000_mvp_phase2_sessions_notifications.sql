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


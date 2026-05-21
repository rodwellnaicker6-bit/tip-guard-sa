-- Idempotent: payment QR RPCs + merchant_locations if prior push stopped early.

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

create index if not exists merchant_locations_merchant_idx on public.merchant_locations (merchant_id, active);

alter table public.merchant_locations enable row level security;

drop policy if exists "merchant_locations_select_own" on public.merchant_locations;
create policy "merchant_locations_select_own" on public.merchant_locations for select to authenticated
  using (public.is_admin() or exists (select 1 from public.merchants m where m.id = merchant_locations.merchant_id and m.user_id = auth.uid()));

drop policy if exists "merchant_locations_insert_own" on public.merchant_locations;
create policy "merchant_locations_insert_own" on public.merchant_locations for insert to authenticated
  with check (exists (select 1 from public.merchants m where m.id = merchant_locations.merchant_id and m.user_id = auth.uid()));

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

alter table public.payment_events enable row level security;
revoke insert, update, delete on public.payment_events from anon, authenticated;

create or replace function public.resolve_tip_target(p_token text)
returns table (
  guard_id uuid, location_id uuid, merchant_id uuid,
  guard_display_name text, default_amount_cents int, scan_count int
)
language sql stable security definer set search_path = public
as $$
  with v as (select trim(p_token) as tok)
  (
    select g.id, coalesce(q.location_id, g.location_id), coalesce(q.merchant_id, g.merchant_id),
      g.display_name, q.default_amount_cents, coalesce(q.scan_count, 0)::int
    from v join public.qr_codes q on q.code_token = v.tok join public.guards g on g.id = q.guard_id
    where length(v.tok) >= 4 and g.verified = true limit 1
  )
  union all
  (
    select g.id, g.location_id, g.merchant_id, g.display_name, null::int, coalesce(tl.scan_count, 0)::int
    from v join public.tip_links tl on tl.token = v.tok join public.guards g on g.id = tl.guard_id
    where length(v.tok) >= 4 and tl.expires_at > now() and g.verified = true
      and not exists (select 1 from public.qr_codes q2 where q2.code_token = v.tok)
    limit 1
  ) limit 1;
$$;
grant execute on function public.resolve_tip_target(text) to anon, authenticated;

create or replace function public.admin_payment_analytics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'tips_succeeded', (select count(*)::bigint from public.tips where status = 'succeeded'),
    'tips_pending', (select count(*)::bigint from public.tips where status = 'pending'),
    'tips_failed', (select count(*)::bigint from public.tips where status = 'failed'),
    'volume_cents_succeeded', (select coalesce(sum(amount_cents),0)::bigint from public.tips where status = 'succeeded'),
    'transactions_succeeded', (select count(*)::bigint from public.transactions where status = 'succeeded'),
    'transactions_failed', (select count(*)::bigint from public.transactions where status = 'failed'),
    'revenue_today_cents', 0,
    'revenue_week_cents', 0,
    'qr_scans_total', (select coalesce(sum(scan_count),0)::bigint from public.tip_links) + (select coalesce(sum(scan_count),0)::bigint from public.qr_codes),
    'top_guards', '[]'::jsonb,
    'merchant_volume', '[]'::jsonb,
    'daily_revenue', '[]'::jsonb
  );
end;
$$;
grant execute on function public.admin_payment_analytics() to authenticated;

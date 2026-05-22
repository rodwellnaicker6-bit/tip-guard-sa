-- Merchant operations + launch integrity: QR types, regenerate RPC, invites scaffold, tip split, resolve extensions

-- Allow venue-owned staff QRs (guard + merchant for RLS and listing)
alter table public.qr_codes drop constraint if exists qr_codes_owner_chk;
alter table public.qr_codes add constraint qr_codes_owner_chk check (
  guard_id is not null or merchant_id is not null
);

-- ── QR code types ───────────────────────────────────────────────────────────
do $$ begin
  create type public.qr_code_type as enum (
    'merchant_permanent',
    'guard_staff',
    'location_table',
    'dynamic_amount'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.qr_codes
  add column if not exists qr_type public.qr_code_type,
  add column if not exists revoked_at timestamptz;

update public.qr_codes
set qr_type = case
  when merchant_id is not null and guard_id is null then 'merchant_permanent'::public.qr_code_type
  when location_id is not null then 'location_table'::public.qr_code_type
  when default_amount_cents is not null then 'dynamic_amount'::public.qr_code_type
  else 'guard_staff'::public.qr_code_type
end
where qr_type is null;

alter table public.qr_codes
  alter column qr_type set default 'guard_staff';

create index if not exists qr_codes_merchant_active_idx
  on public.qr_codes (merchant_id, qr_type)
  where revoked_at is null;

-- ── Merchant tip split (bps override; null = platform default) ──────────────
alter table public.merchants
  add column if not exists tip_split_bps int check (tip_split_bps is null or (tip_split_bps >= 0 and tip_split_bps <= 10000));

comment on column public.merchants.tip_split_bps is
  'Optional guard/venue split in basis points; null uses platform_settings fee. See docs/TIP_SPLIT.md.';

-- ── Staff invites scaffold (post-MVP activation) ─────────────────────────────
create table if not exists public.merchant_invites (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('staff', 'manager')),
  token_hash text not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (merchant_id, email)
);

alter table public.merchant_invites enable row level security;

drop policy if exists "merchant_invites_owner" on public.merchant_invites;
create policy "merchant_invites_owner"
  on public.merchant_invites for all
  to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.merchants m where m.id = merchant_invites.merchant_id and m.user_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.merchants m where m.id = merchant_invites.merchant_id and m.user_id = auth.uid())
  );

-- ── payment_events: refund/cancel status values ─────────────────────────────
alter table public.payment_events drop constraint if exists payment_events_status_check;
alter table public.payment_events add constraint payment_events_status_check
  check (status in ('received', 'processed', 'failed', 'refunded', 'cancelled'));

-- ── Regenerate QR token (revoke old row, insert successor) ──────────────────
create or replace function public.regenerate_qr_code_token(p_qr_id uuid)
returns table (id uuid, code_token text, qr_type public.qr_code_type)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.qr_codes%rowtype;
  v_tok text;
  v_new_id uuid;
begin
  select * into v_old from public.qr_codes where id = p_qr_id for update;
  if not found then
    raise exception 'qr_not_found';
  end if;

  if not public.is_admin()
    and not exists (select 1 from public.merchants m where m.id = v_old.merchant_id and m.user_id = auth.uid())
    and not exists (
      select 1 from public.guards g
      join public.merchants m on m.id = g.merchant_id
      where g.id = v_old.guard_id and m.user_id = auth.uid()
    )
    and not exists (select 1 from public.guards g where g.id = v_old.guard_id and g.user_id = auth.uid())
  then
    raise exception 'forbidden';
  end if;

  if v_old.revoked_at is not null then
    raise exception 'qr_already_revoked';
  end if;

  update public.qr_codes set revoked_at = now() where id = p_qr_id;

  v_tok := 'tg_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.qr_codes (
    guard_id, merchant_id, location_id, code_token, label,
    qr_type, default_amount_cents, created_by, expires_at
  )
  values (
    v_old.guard_id,
    v_old.merchant_id,
    v_old.location_id,
    v_tok,
    coalesce(v_old.label, 'Regenerated QR'),
    v_old.qr_type,
    v_old.default_amount_cents,
    auth.uid(),
    now() + interval '400 days'
  )
  returning qr_codes.id into v_new_id;

  return query
  select v_new_id, v_tok, v_old.qr_type;
end;
$$;

revoke all on function public.regenerate_qr_code_token(uuid) from public;
grant execute on function public.regenerate_qr_code_token(uuid) to authenticated;

-- ── resolve_tip_target: merchant-only + dynamic amount QR paths ─────────────
create or replace function public.resolve_tip_target(p_token text)
returns table (
  guard_id uuid,
  location_id uuid,
  merchant_id uuid,
  guard_display_name text,
  default_amount_cents int,
  scan_count int,
  qr_type text
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
      coalesce(q.scan_count, 0)::int,
      q.qr_type::text
    from v
    join public.qr_codes q on q.code_token = v.tok
    join public.guards g on g.id = q.guard_id
    where length(v.tok) >= 4
      and g.verified = true
      and q.revoked_at is null
      and q.expires_at > now()
      and (
        coalesce(q.merchant_id, g.merchant_id) is null
        or exists (
          select 1 from public.merchants m
          where m.id = coalesce(q.merchant_id, g.merchant_id) and m.verified = true
        )
      )
    limit 1
  )
  union all
  (
    select
      g.id,
      q.location_id,
      q.merchant_id,
      coalesce(m.business_name, 'Venue') || ' · Team tip',
      q.default_amount_cents,
      coalesce(q.scan_count, 0)::int,
      q.qr_type::text
    from v
    join public.qr_codes q on q.code_token = v.tok
    join public.merchants m on m.id = q.merchant_id
    join lateral (
      select g2.id, g2.display_name, g2.location_id
      from public.guards g2
      where g2.merchant_id = q.merchant_id
        and g2.verified = true
        and (q.location_id is null or g2.location_id = q.location_id)
      order by g2.created_at
      limit 1
    ) pick on true
    join public.guards g on g.id = pick.id
    where length(v.tok) >= 4
      and q.guard_id is null
      and q.merchant_id is not null
      and q.revoked_at is null
      and q.expires_at > now()
      and m.verified = true
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
      coalesce(tl.scan_count, 0)::int,
      'guard_staff'::text
    from v
    join public.tip_links tl on tl.token = v.tok
    join public.guards g on g.id = tl.guard_id
    where length(v.tok) >= 4
      and tl.expires_at > now()
      and g.verified = true
      and (
        g.merchant_id is null
        or exists (select 1 from public.merchants m where m.id = g.merchant_id and m.verified = true)
      )
      and not exists (
        select 1 from public.qr_codes q2
        where q2.code_token = v.tok and q2.revoked_at is null and q2.expires_at > now()
      )
    limit 1
  )
  limit 1;
$$;

revoke all on function public.resolve_tip_target(text) from public;
grant execute on function public.resolve_tip_target(text) to anon, authenticated;

-- ── Admin ops metrics: QR scan events from payment_events ───────────────────
create or replace function public.admin_ops_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'tips_today', (
      select count(*)::bigint from public.tips
      where status = 'succeeded' and created_at >= date_trunc('day', now())
    ),
    'volume_cents_today', (
      select coalesce(sum(amount_cents), 0)::bigint from public.tips
      where status = 'succeeded' and created_at >= date_trunc('day', now())
    ),
    'failed_webhooks', (
      select count(*)::bigint from public.webhook_retry_queue where status = 'failed'
    ),
    'dlq_size', (
      select count(*)::bigint from public.webhook_retry_queue where status = 'dead_letter'
    ),
    'reconciliation_mismatches_7d', (
      select coalesce(sum(mismatch_count), 0)::bigint from public.reconciliation_log
      where run_at > now() - interval '7 days'
    ),
    'pending_webhook_retries', (
      select count(*)::bigint from public.webhook_retry_queue where status = 'pending'
    ),
    'open_disputes', (
      select count(*)::bigint from public.disputes where status = 'open'
    ),
    'qr_scans_24h', (
      select count(*)::bigint from public.payment_events
      where event_type = 'qr.scan' and created_at > now() - interval '24 hours'
    ),
    'payment_events_24h', (
      select count(*)::bigint from public.payment_events
      where created_at > now() - interval '24 hours'
    )
  );
end;
$$;

revoke all on function public.admin_ops_metrics() from public;
grant execute on function public.admin_ops_metrics() to authenticated;

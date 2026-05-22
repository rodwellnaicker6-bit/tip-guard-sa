-- Launch pass: QR expiry, merchant guard validation, scan audit, session anti-replay helper

alter table public.qr_codes
  add column if not exists expires_at timestamptz not null default (now() + interval '400 days'),
  add column if not exists revoked_at timestamptz;

create index if not exists qr_codes_expires_idx on public.qr_codes (expires_at)
  where revoked_at is null;

-- Extend payment_events provider for internal QR scan audit (service_role inserts only)
alter table public.payment_events drop constraint if exists payment_events_provider_check;
alter table public.payment_events add constraint payment_events_provider_check
  check (provider in ('paystack', 'yoco', 'payfast', 'ozow', 'peach_payments', 'tipguard'));

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
    where length(v.tok) >= 4
      and g.verified = true
      and q.revoked_at is null
      and q.expires_at > now()
      and (
        coalesce(q.merchant_id, g.merchant_id) is null
        or exists (
          select 1 from public.merchants m
          where m.id = coalesce(q.merchant_id, g.merchant_id)
            and m.verified = true
        )
      )
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
      and (
        g.merchant_id is null
        or exists (
          select 1 from public.merchants m
          where m.id = g.merchant_id and m.verified = true
        )
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

create or replace function public.touch_qr_code(p_code_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guard_id uuid;
begin
  update public.qr_codes q
  set scan_count = scan_count + 1, last_scanned_at = now()
  from public.guards g
  where q.code_token = p_code_token
    and q.guard_id = g.id
    and q.revoked_at is null
    and q.expires_at > now()
    and g.verified = true
  returning q.guard_id into v_guard_id;

  if v_guard_id is not null then
    insert into public.payment_events (
      provider, provider_event_id, event_type, status, payload
    ) values (
      'tipguard',
      'qr_scan:' || left(p_code_token, 32) || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::text,
      'qr.scan',
      'received',
      jsonb_build_object('code_token', left(p_code_token, 64), 'guard_id', v_guard_id)
    )
    on conflict (provider, provider_event_id) do nothing;
  end if;
end;
$$;

-- Returns false when this payer already completed checkout for the same QR/link token (anti-replay).
create or replace function public.claim_tip_link_session(
  p_link_token text,
  p_guard_id uuid,
  p_payer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tok text := nullif(trim(p_link_token), '');
  v_sid uuid;
begin
  if p_payer_id is null or p_guard_id is null then
    return false;
  end if;

  if v_tok is not null then
    if exists (
      select 1 from public.tip_sessions ts
      where ts.source_link_token = v_tok
        and ts.payer_id = p_payer_id
        and ts.status in ('checkout', 'completed')
        and ts.expires_at > now() - interval '7 days'
    ) then
      return false;
    end if;
  end if;

  insert into public.tip_sessions (guard_id, payer_id, source_link_token, status)
  values (p_guard_id, p_payer_id, v_tok, 'checkout')
  returning id into v_sid;

  return v_sid is not null;
exception
  when unique_violation then
    return false;
end;
$$;

revoke all on function public.claim_tip_link_session(text, uuid, uuid) from public;
grant execute on function public.claim_tip_link_session(text, uuid, uuid) to service_role;

-- P0: fraud_events client insert was admin-only; ensure no broad authenticated insert
drop policy if exists "fraud_events_authenticated_insert" on public.fraud_events;
revoke insert on public.fraud_events from authenticated;

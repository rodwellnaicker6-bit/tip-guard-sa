-- Compliance demo stabilization: idempotent RPC/schema reconcile (no destructive DDL).
-- Safe to re-apply when prod migration history diverged from repo.

-- ── save_onboarding_role (latest guard/merchant pick rules) ─────────────────
create or replace function public.save_onboarding_role(p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_new text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_role is null or p_role not in ('customer', 'guard', 'merchant') then
    raise exception 'invalid role';
  end if;

  v_name := coalesce(
    nullif(trim(auth.jwt()->'user_metadata'->>'full_name'), ''),
    nullif(trim(split_part(coalesce(auth.jwt()->>'email', ''), '@', 1)), ''),
    'Member'
  );

  insert into public.profiles (id, role, full_name)
  values (v_uid, 'customer', v_name)
  on conflict (id) do nothing;

  select role into v_old from public.profiles where id = v_uid;
  if v_old is null then
    raise exception 'profile row missing after bootstrap';
  end if;

  if v_old is distinct from p_role then
    if auth.role() = 'service_role' or public.is_admin() then
      update public.profiles set role = p_role, updated_at = now() where id = v_uid;
    elsif v_old = 'customer' and p_role in ('customer', 'guard', 'merchant') then
      update public.profiles set role = p_role, updated_at = now() where id = v_uid;
    elsif v_old in ('guard', 'merchant')
      and p_role in ('guard', 'merchant')
      and not exists (select 1 from public.guards g where g.user_id = v_uid)
      and not exists (select 1 from public.merchants m where m.user_id = v_uid) then
      update public.profiles set role = p_role, updated_at = now() where id = v_uid;
    else
      raise exception 'profile role cannot be changed without admin or service role';
    end if;
  end if;

  select role into v_new from public.profiles where id = v_uid;
  return v_new;
end;
$$;

revoke all on function public.save_onboarding_role(text) from public;
grant execute on function public.save_onboarding_role(text) to authenticated;

-- ── resolve_tip_target (merchant ops launch signature) ─────────────────────
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

-- Non-revoked codes with past expires_at (pre-migration rows) stay scannable.
update public.qr_codes
set expires_at = now() + interval '400 days'
where revoked_at is null
  and expires_at <= now();

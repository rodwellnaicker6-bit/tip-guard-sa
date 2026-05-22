-- Launch: admin payout integrity + pg_cron helpers (schedule via Dashboard or scripts/schedule-cron-jobs.sql)

-- Allow admin path when settle/release invoked from admin_update_payout_status (session is authenticated admin)
create or replace function public.settle_guard_payout_hold(p_payout_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payout_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    raise exception 'service_role or admin only';
  end if;

  select * into v_row from public.payout_requests where id = p_payout_id for update;
  if not found or v_row.guard_id is null then
    return false;
  end if;
  if v_row.status = 'paid' then
    return true;
  end if;

  update public.wallet_accounts
  set
    pending_cents = greatest(0, pending_cents - v_row.amount_cents),
    updated_at = now()
  where guard_id = v_row.guard_id;

  return true;
end;
$$;

create or replace function public.release_guard_payout_hold(p_payout_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payout_requests%rowtype;
  v_pending bigint;
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    raise exception 'service_role or admin only';
  end if;

  select * into v_row from public.payout_requests where id = p_payout_id for update;
  if not found or v_row.guard_id is null then
    return false;
  end if;
  if v_row.status in ('paid', 'rejected') then
    return true;
  end if;

  select pending_cents into v_pending
  from public.wallet_accounts
  where guard_id = v_row.guard_id
  for update;

  if coalesce(v_pending, 0) < v_row.amount_cents then
    return false;
  end if;

  update public.wallet_accounts
  set
    pending_cents = pending_cents - v_row.amount_cents,
    available_cents = available_cents + v_row.amount_cents,
    updated_at = now()
  where guard_id = v_row.guard_id;

  update public.guards
  set balance_cents = balance_cents + v_row.amount_cents
  where id = v_row.guard_id;

  return true;
end;
$$;

create or replace function public.admin_update_payout_status(p_payout_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payout_requests%rowtype;
  v_ok boolean;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_status not in ('processing', 'paid', 'rejected', 'failed') then
    raise exception 'invalid status: %', p_status;
  end if;

  select * into v_row from public.payout_requests where id = p_payout_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_status = 'paid' and v_row.status is distinct from 'paid' then
    v_ok := public.settle_guard_payout_hold(p_payout_id);
    if not v_ok then
      return jsonb_build_object('ok', false, 'error', 'settle_hold_failed');
    end if;
  elsif p_status in ('rejected', 'failed') and v_row.status not in ('paid', 'rejected') then
    v_ok := public.release_guard_payout_hold(p_payout_id);
    if not v_ok then
      return jsonb_build_object('ok', false, 'error', 'release_hold_failed');
    end if;
  end if;

  update public.payout_requests
  set status = p_status, updated_at = now()
  where id = p_payout_id;

  perform public.log_admin_audit(
    'payout_status',
    'payout_requests',
    p_payout_id::text,
    jsonb_build_object('status', p_status, 'previous_status', v_row.status)
  );

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

revoke all on function public.admin_update_payout_status(uuid, text) from public;
grant execute on function public.admin_update_payout_status(uuid, text) to authenticated;

-- pg_cron / pg_net: enable on hosted Supabase; schedule jobs in Dashboard or scripts/schedule-cron-jobs.sql
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

comment on function public.admin_update_payout_status(uuid, text) is
  'Admin payout state machine: processing (no wallet change), paid (settle hold), rejected/failed (release hold). Audited via log_admin_audit.';

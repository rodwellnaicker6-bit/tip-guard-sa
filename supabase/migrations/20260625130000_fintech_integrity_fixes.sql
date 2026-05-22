-- TipGuard SA — Fintech integrity audit fixes (P0)
-- 1) finalize_tip: credit wallet only when tip transitions pending→succeeded
-- 2) settle/release payout holds on transfer webhook outcomes

create or replace function public.finalize_tip_from_paystack_reference(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fee_bps int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'finalize_tip_from_paystack_reference is service_role only';
  end if;

  v_fee_bps := public.get_platform_fee_bps();

  with updated as (
    update public.tips t
    set
      status = 'succeeded',
      commission_cents = coalesce(
        t.commission_cents,
        greatest(0, round(t.amount_cents::numeric * v_fee_bps / 10000.0)::int)
      ),
      net_amount_cents = coalesce(
        t.net_amount_cents,
        t.amount_cents - greatest(0, round(t.amount_cents::numeric * v_fee_bps / 10000.0)::int)
      )
    where t.paystack_reference = p_reference
      and t.status = 'pending'
    returning id, guard_id, amount_cents, commission_cents, net_amount_cents
  ),
  nets as (
    select
      u.guard_id,
      coalesce(u.net_amount_cents, u.amount_cents - coalesce(u.commission_cents, 0)) as credit_cents
    from updated u
  ),
  guard_upd as (
    update public.guards g
    set
      tips_count = g.tips_count + 1,
      balance_cents = g.balance_cents + n.credit_cents
    from nets n
    where g.id = n.guard_id
    returning g.id
  )
  insert into public.wallet_accounts (guard_id, available_cents, pending_cents)
  select n.guard_id, n.credit_cents, 0
  from nets n
  on conflict (guard_id) do update
  set
    available_cents = public.wallet_accounts.available_cents + excluded.available_cents,
    updated_at = now();
end;
$$;

-- Clear pending hold when bank transfer completes (funds left platform)
create or replace function public.settle_guard_payout_hold(p_payout_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payout_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role only';
  end if;

  select * into v_row from public.payout_requests where id = p_payout_id for update;
  if not found or v_row.guard_id is null then
    return false;
  end if;
  update public.wallet_accounts
  set
    pending_cents = greatest(0, pending_cents - v_row.amount_cents),
    updated_at = now()
  where guard_id = v_row.guard_id;

  return true;
end;
$$;

-- Return held funds to available on failed/rejected payout
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
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role only';
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

revoke all on function public.settle_guard_payout_hold(uuid) from public;
grant execute on function public.settle_guard_payout_hold(uuid) to service_role;

revoke all on function public.release_guard_payout_hold(uuid) from public;
grant execute on function public.release_guard_payout_hold(uuid) to service_role;

-- Roll back hold when payout row insert fails (no payout id yet)
create or replace function public.reverse_guard_payout_hold(p_guard_id uuid, p_amount_cents bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role only';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return false;
  end if;

  select pending_cents into v_pending
  from public.wallet_accounts
  where guard_id = p_guard_id
  for update;

  if coalesce(v_pending, 0) < p_amount_cents then
    return false;
  end if;

  update public.wallet_accounts
  set
    pending_cents = pending_cents - p_amount_cents,
    available_cents = available_cents + p_amount_cents,
    updated_at = now()
  where guard_id = p_guard_id;

  update public.guards
  set balance_cents = balance_cents + p_amount_cents
  where id = p_guard_id;

  return true;
end;
$$;

revoke all on function public.reverse_guard_payout_hold(uuid, bigint) from public;
grant execute on function public.reverse_guard_payout_hold(uuid, bigint) to service_role;

-- Max retries exhausted: release hold when marking failed
create or replace function public.schedule_payout_retry(p_payout_id uuid, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payout_requests%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role only';
  end if;

  select * into v_row from public.payout_requests where id = p_payout_id for update;
  if not found then return false; end if;

  if v_row.retry_count >= coalesce(v_row.max_retries, 3) then
    update public.payout_requests
    set status = 'failed', last_error = coalesce(p_error, 'max_retries'), updated_at = now()
    where id = p_payout_id;
    perform public.release_guard_payout_hold(p_payout_id);
    return false;
  end if;

  update public.payout_requests
  set
    status = 'retrying',
    retry_count = v_row.retry_count + 1,
    last_error = p_error,
    next_retry_at = now() + (power(2, v_row.retry_count) * interval '15 minutes'),
    updated_at = now()
  where id = p_payout_id;
  return true;
end;
$$;

-- Additive platform fee: amount_cents = tip to merchant/guard; customer_paid_cents = tip + commission.

alter table public.tips
  add column if not exists customer_paid_cents int check (customer_paid_cents is null or customer_paid_cents > 0);

comment on column public.tips.amount_cents is
  'Tip amount credited to guard/merchant (excludes platform fee).';
comment on column public.tips.commission_cents is
  'Platform fee collected from customer (additive on top of amount_cents).';
comment on column public.tips.customer_paid_cents is
  'Total charged to customer (amount_cents + commission_cents).';

-- Backfill: legacy deducted model stored net in net_amount_cents
update public.tips
set
  customer_paid_cents = coalesce(
    customer_paid_cents,
    amount_cents + coalesce(commission_cents, 0)
  ),
  net_amount_cents = amount_cents
where customer_paid_cents is null;

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
      customer_paid_cents = coalesce(
        t.customer_paid_cents,
        t.amount_cents + greatest(0, round(t.amount_cents::numeric * v_fee_bps / 10000.0)::int)
      ),
      net_amount_cents = t.amount_cents
    where t.paystack_reference = p_reference
      and t.status = 'pending'
    returning id, guard_id, amount_cents, commission_cents, net_amount_cents, customer_paid_cents
  ),
  nets as (
    select
      u.guard_id,
      u.amount_cents as tip_amount_cents,
      u.amount_cents as credit_cents
    from updated u
  ),
  snap as (
    select
      n.guard_id,
      n.tip_amount_cents,
      n.credit_cents,
      g.merchant_id,
      coalesce(wa.available_cents, g.balance_cents, 0)::bigint as wallet_before_cents
    from nets n
    join public.guards g on g.id = n.guard_id
    left join public.wallet_accounts wa on wa.guard_id = n.guard_id
  ),
  guard_upd as (
    update public.guards g
    set
      tips_count = g.tips_count + 1,
      balance_cents = g.balance_cents + s.credit_cents
    from snap s
    where g.id = s.guard_id
    returning g.id
  ),
  wallet_upd as (
    insert into public.wallet_accounts (guard_id, available_cents, pending_cents)
    select s.guard_id, s.credit_cents, 0
    from snap s
    on conflict (guard_id) do update
    set
      available_cents = public.wallet_accounts.available_cents + excluded.available_cents,
      updated_at = now()
    returning guard_id, available_cents
  )
  insert into public.payment_traces (
    payment_reference,
    merchant_id,
    guard_id,
    tip_amount_cents,
    allocated_amount_cents,
    wallet_before_cents,
    wallet_after_cents
  )
  select
    p_reference,
    s.merchant_id,
    s.guard_id,
    s.tip_amount_cents,
    s.credit_cents,
    s.wallet_before_cents,
    w.available_cents
  from snap s
  join wallet_upd w on w.guard_id = s.guard_id
  on conflict (payment_reference) do update
  set
    merchant_id = excluded.merchant_id,
    guard_id = excluded.guard_id,
    tip_amount_cents = excluded.tip_amount_cents,
    allocated_amount_cents = excluded.allocated_amount_cents,
    wallet_before_cents = excluded.wallet_before_cents,
    wallet_after_cents = excluded.wallet_after_cents;
end;
$$;

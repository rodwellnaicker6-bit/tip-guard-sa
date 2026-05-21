-- Customer tip history without nested `guards` joins (avoids RLS on guards for payers).
-- RPC: security definer reads tips + guard display_name where payer_id = auth.uid().

create or replace function public.get_customer_tip_history()
returns table (
  id uuid,
  amount_cents int,
  status text,
  created_at timestamptz,
  guard_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.amount_cents,
    t.status,
    t.created_at,
    g.display_name as guard_display_name
  from public.tips t
  join public.guards g on g.id = t.guard_id
  where t.payer_id = auth.uid()
  order by t.created_at desc
  limit 100;
$$;

revoke all on function public.get_customer_tip_history() from public;
grant execute on function public.get_customer_tip_history() to authenticated;

comment on function public.get_customer_tip_history() is
  'Returns the authenticated customer''s tips with guard display names; avoids client-side joins into guards under stricter RLS.';

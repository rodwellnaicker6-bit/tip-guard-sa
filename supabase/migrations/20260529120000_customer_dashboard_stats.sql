-- Customer dashboard: fast aggregated tip stats (security definer, avoids heavy client RLS scans).

create index if not exists tips_payer_status_idx
  on public.tips (payer_id, status)
  where payer_id is not null;

create or replace function public.get_customer_tip_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'tip_count', count(*)::int,
    'volume_cents', coalesce(sum(amount_cents), 0)::bigint
  )
  from public.tips
  where payer_id = auth.uid()
    and status = 'succeeded';
$$;

revoke all on function public.get_customer_tip_stats() from public;
grant execute on function public.get_customer_tip_stats() to authenticated;

comment on function public.get_customer_tip_stats() is
  'Returns succeeded tip count and volume_cents for the authenticated payer; used by customer dashboard.';

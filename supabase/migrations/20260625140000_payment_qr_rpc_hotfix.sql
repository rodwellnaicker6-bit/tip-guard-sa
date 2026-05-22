-- Hotfix: deploy payment QR RPCs when migration history diverged from schema.
-- Idempotent; safe to run in SQL Editor or via: npx supabase db query --linked -f supabase/migrations/20260625140000_payment_qr_rpc_hotfix.sql

-- Optional columns when payment_qr_production never ran on this project.
alter table public.guards
  add column if not exists merchant_id uuid,
  add column if not exists location_id uuid;

alter table public.qr_codes
  add column if not exists location_id uuid,
  add column if not exists default_amount_cents int;

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

revoke all on function public.resolve_tip_target(text) from public;
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

revoke all on function public.admin_payment_analytics() from public;
grant execute on function public.admin_payment_analytics() to authenticated;

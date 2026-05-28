-- Production hotfix: ensure fraud_rules + run_fraud_checks exist (fixes PGRST202).
-- Timestamp after 20260626220000 so linked prod applies this migration on db push.

create table if not exists public.fraud_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.fraud_rules enable row level security;

drop policy if exists "fraud_rules_admin_select" on public.fraud_rules;
create policy "fraud_rules_admin_select"
  on public.fraud_rules for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.fraud_rules from anon, authenticated;

insert into public.fraud_rules (rule_key, description, config) values
  ('velocity_per_user_hour', 'Max init/verify attempts per user per hour', '{"max_count": 30}'::jsonb),
  ('amount_cap_cents', 'Max single tip amount in cents', '{"max_cents": 5000000}'::jsonb),
  ('duplicate_reference', 'Block duplicate paystack_reference on new tips', '{"enabled": true}'::jsonb)
on conflict (rule_key) do nothing;

create or replace function public.run_fraud_checks(
  p_user_id uuid,
  p_amount_cents int default null,
  p_reference text default null,
  p_route text default 'payment'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_triggered jsonb := '[]'::jsonb;
  v_rule record;
  v_count int;
  v_max int;
  v_cap int;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role only';
  end if;

  for v_rule in select * from public.fraud_rules where enabled = true loop
    if v_rule.rule_key = 'velocity_per_user_hour' and p_user_id is not null then
      v_max := coalesce((v_rule.config->>'max_count')::int, 30);
      select count(*)::int into v_count
      from public.transactions tx
      where tx.user_id = p_user_id
        and tx.created_at > now() - interval '1 hour';
      if v_count >= v_max then
        v_triggered := v_triggered || jsonb_build_array(jsonb_build_object(
          'rule', v_rule.rule_key, 'count', v_count, 'max', v_max
        ));
      end if;
    elsif v_rule.rule_key = 'amount_cap_cents' and p_amount_cents is not null then
      v_cap := coalesce((v_rule.config->>'max_cents')::int, 5000000);
      if p_amount_cents > v_cap then
        v_triggered := v_triggered || jsonb_build_array(jsonb_build_object(
          'rule', v_rule.rule_key, 'amount_cents', p_amount_cents, 'max_cents', v_cap
        ));
      end if;
    elsif v_rule.rule_key = 'duplicate_reference' and p_reference is not null
      and coalesce((v_rule.config->>'enabled')::boolean, true) then
      if exists (
        select 1 from public.tips t
        where t.paystack_reference = p_reference and t.status = 'succeeded'
      ) then
        v_triggered := v_triggered || jsonb_build_array(jsonb_build_object(
          'rule', v_rule.rule_key, 'reference', p_reference
        ));
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_triggered) > 0 and p_user_id is not null then
    insert into public.fraud_events (user_id, kind, detail)
    select p_user_id, 'fraud_rule_' || (elem->>'rule'), elem
    from jsonb_array_elements(v_triggered) elem;
  end if;

  return jsonb_build_object('triggered', v_triggered, 'blocked', jsonb_array_length(v_triggered) > 0);
end;
$$;

revoke all on function public.run_fraud_checks(uuid, int, text, text) from public;
grant execute on function public.run_fraud_checks(uuid, int, text, text) to service_role;

notify pgrst, 'reload schema';

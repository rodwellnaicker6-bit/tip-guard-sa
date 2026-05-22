-- TipGuard SA — Financial / ops systems (reconciliation, fraud, DLQ, audit, disputes)

-- ── 1. Webhook retry queue: dead-letter status ───────────────────────────────
alter table public.webhook_retry_queue drop constraint if exists webhook_retry_queue_status_check;
alter table public.webhook_retry_queue add constraint webhook_retry_queue_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter'));

create index if not exists webhook_retry_queue_dlq_idx
  on public.webhook_retry_queue (updated_at desc)
  where status = 'dead_letter';

drop policy if exists "webhook_retry_queue_admin_select" on public.webhook_retry_queue;
create policy "webhook_retry_queue_admin_select"
  on public.webhook_retry_queue for select to authenticated
  using (public.is_admin());

drop policy if exists "webhook_retry_queue_admin_update" on public.webhook_retry_queue;
create policy "webhook_retry_queue_admin_update"
  on public.webhook_retry_queue for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, update on public.webhook_retry_queue to authenticated;

-- ── 2. Fraud rules (configurable; seed defaults) ─────────────────────────────
create table if not exists public.fraud_rules (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null unique,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.fraud_rules enable row level security;

create policy "fraud_rules_admin_select"
  on public.fraud_rules for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.fraud_rules from anon, authenticated;

insert into public.fraud_rules (rule_key, description, config) values
  ('velocity_per_user_hour', 'Max init/verify attempts per user per hour', '{"max_count": 30}'::jsonb),
  ('amount_cap_cents', 'Max single tip amount in cents', '{"max_cents": 5000000}'::jsonb),
  ('duplicate_reference', 'Block duplicate paystack_reference on new tips', '{"enabled": true}'::jsonb)
on conflict (rule_key) do nothing;

alter table public.platform_settings
  add column if not exists fraud_config jsonb not null default '{}'::jsonb;

-- ── 3. Merchant risk score ───────────────────────────────────────────────────
alter table public.merchants
  add column if not exists risk_score int not null default 0 check (risk_score >= 0 and risk_score <= 100);

create or replace function public.update_merchant_risk(p_merchant_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_failed int;
  v_score int;
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select count(*)::int into v_failed
  from public.tips t
  join public.guards g on g.id = t.guard_id
  where g.merchant_id = p_merchant_id
    and t.status = 'failed'
    and t.created_at > now() - interval '90 days';

  v_score := least(100, v_failed * 5 + coalesce((
    select count(*)::int from public.fraud_events fe
    where fe.detail->>'merchant_id' = p_merchant_id::text
      and fe.created_at > now() - interval '90 days'
  ), 0) * 10);

  update public.merchants set risk_score = v_score where id = p_merchant_id;
  return v_score;
end;
$$;

revoke all on function public.update_merchant_risk(uuid) from public;
grant execute on function public.update_merchant_risk(uuid) to service_role, authenticated;

-- ── 4. Payout retry columns + status extension ───────────────────────────────
alter table public.payout_requests
  add column if not exists retry_count int not null default 0,
  add column if not exists max_retries int not null default 3,
  add column if not exists last_error text,
  add column if not exists next_retry_at timestamptz;

alter table public.payout_requests drop constraint if exists payout_requests_status_check;
alter table public.payout_requests add constraint payout_requests_status_check
  check (status in ('pending', 'processing', 'paid', 'rejected', 'failed', 'retrying'));

-- ── 5. Admin audit log (admin UI + service_role) ─────────────────────────────
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log (actor_id);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log_admin_select"
  on public.admin_audit_log for select to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

create or replace function public.log_admin_audit(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.log_admin_audit(text, text, text, jsonb) from public;
grant execute on function public.log_admin_audit(text, text, text, jsonb) to authenticated;

-- ── 6. Disputes workflow ─────────────────────────────────────────────────────
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  tip_id uuid references public.tips (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  reason text,
  resolution_note text,
  created_by uuid references auth.users (id) on delete set null,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists disputes_merchant_status_idx
  on public.disputes (merchant_id, status, created_at desc);

alter table public.disputes enable row level security;

create policy "disputes_merchant_select"
  on public.disputes for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.merchants m where m.id = disputes.merchant_id and m.user_id = auth.uid())
  );

create policy "disputes_merchant_insert"
  on public.disputes for insert to authenticated
  with check (
    exists (select 1 from public.merchants m where m.id = merchant_id and m.user_id = auth.uid())
  );

create policy "disputes_admin_select"
  on public.disputes for select to authenticated
  using (public.is_admin());

create policy "disputes_admin_update"
  on public.disputes for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 7. Idempotency: payment reference uniqueness ─────────────────────────────
create unique index if not exists payment_events_paystack_reference_uidx
  on public.payment_events (paystack_reference)
  where paystack_reference is not null;

-- tips.paystack_reference unique index exists from 20260211000000

-- ── 8. Fraud check RPC (called from Edge via service_role) ───────────────────
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

-- ── 9. Daily payout reconciliation report ────────────────────────────────────
create or replace function public.payout_reconciliation_report(p_day date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := p_day::timestamptz;
  v_end timestamptz := (p_day + 1)::timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'day', p_day,
    'payouts_requested', (
      select count(*)::bigint from public.payout_requests pr
      where pr.created_at >= v_start and pr.created_at < v_end
    ),
    'payouts_paid', (
      select count(*)::bigint from public.payout_requests pr
      where pr.status = 'paid' and pr.updated_at >= v_start and pr.updated_at < v_end
    ),
    'payouts_failed', (
      select count(*)::bigint from public.payout_requests pr
      where pr.status in ('failed', 'rejected') and pr.updated_at >= v_start and pr.updated_at < v_end
    ),
    'payouts_retrying', (
      select count(*)::bigint from public.payout_requests pr where pr.status = 'retrying'
    ),
    'amount_cents_paid', (
      select coalesce(sum(pr.amount_cents), 0)::bigint from public.payout_requests pr
      where pr.status = 'paid' and pr.updated_at >= v_start and pr.updated_at < v_end
    ),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'status', pr.status,
        'amount_cents', pr.amount_cents,
        'retry_count', pr.retry_count,
        'created_at', pr.created_at,
        'updated_at', pr.updated_at
      )), '[]'::jsonb)
      from (
        select id, status, amount_cents, retry_count, created_at, updated_at
        from public.payout_requests
        where created_at >= v_start and created_at < v_end
        order by created_at desc
        limit 100
      ) pr
    )
  );
end;
$$;

revoke all on function public.payout_reconciliation_report(date) from public;
grant execute on function public.payout_reconciliation_report(date) to authenticated;

-- ── 10. Admin ops metrics (production dashboard) ─────────────────────────────
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
      select count(*)::bigint from public.webhook_retry_queue
      where status = 'failed'
    ),
    'dlq_size', (
      select count(*)::bigint from public.webhook_retry_queue
      where status = 'dead_letter'
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
    )
  );
end;
$$;

revoke all on function public.admin_ops_metrics() from public;
grant execute on function public.admin_ops_metrics() to authenticated;

-- ── 11. Payout retry helper (service_role / webhook) ─────────────────────────
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

revoke all on function public.schedule_payout_retry(uuid, text) from public;
grant execute on function public.schedule_payout_retry(uuid, text) to service_role;

-- ── 12. pg_cron stub (enable extension in Dashboard if needed) ───────────────
comment on function public.payout_reconciliation_report(date) is
  'Sample: select public.payout_reconciliation_report(current_date);';

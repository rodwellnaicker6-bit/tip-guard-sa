-- =============================================================================
-- TipGuard SA — Ecosystem scaling core (production fintech substrate)
-- WHAT: Server-side loyalty + ledger, referrals, KYC case tracking, analytics
--       events, merchant financial/verification hardening, tip session payment
--       surface metadata, settlement post-hooks (loyalty + audit + analytics).
-- WHY:  Demo tables become an auditable, monetizable SA platform with hooks for
--       Apple/Google Pay surfaces, NFC/RFID prep, YieldCore-style downstream AI.
-- WHEN: Apply after 20260620120000_mvp_phase2_sessions_notifications.sql
-- =============================================================================

-- ── 1. Referral codes on profiles (immutable client-side; generated if empty) ─
alter table public.profiles add column if not exists referral_code text;

create unique index if not exists profiles_referral_code_uidx
  on public.profiles (referral_code)
  where referral_code is not null;

create or replace function public.profiles_fill_referral_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cand text;
  tries int := 0;
begin
  if tg_op = 'INSERT' then
    if new.referral_code is not null and length(trim(new.referral_code)) > 0 then
      return new;
    end if;
    loop
      cand := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.profiles p where p.referral_code = cand);
      tries := tries + 1;
      exit when tries > 32;
    end loop;
    new.referral_code := cand;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_fill_referral_code on public.profiles;
create trigger trg_profiles_fill_referral_code
  before insert on public.profiles
  for each row
  execute function public.profiles_fill_referral_code();

-- Backfill existing profiles (best-effort unique codes)
do $$
declare
  r record;
  cand text;
  k int;
begin
  for r in select id from public.profiles where referral_code is null loop
    k := 0;
    loop
      cand := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      exit when not exists (select 1 from public.profiles p where p.referral_code = cand);
      k := k + 1;
      exit when k > 40;
    end loop;
    update public.profiles set referral_code = cand where id = r.id;
  end loop;
end $$;

create or replace function public.profile_protect_referral_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.referral_code is distinct from old.referral_code then
    if auth.role() = 'service_role' or public.is_admin() then
      return new;
    end if;
    raise exception 'referral_code cannot be changed from the client';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_protect_referral_code on public.profiles;
create trigger trg_profiles_protect_referral_code
  before update on public.profiles
  for each row
  execute function public.profile_protect_referral_code();

-- ── 2. Referrals (one attribution per referee; rewards settled by ops / Edge) ─
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users (id) on delete cascade,
  referee_user_id uuid not null references auth.users (id) on delete cascade,
  referral_code_snapshot text not null,
  status text not null default 'pending'
    check (status in ('pending', 'qualified', 'rewarded', 'void')),
  qualified_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint referrals_referee_unique unique (referee_user_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id, created_at desc);

alter table public.referrals enable row level security;

create policy "referrals_select_referrer_or_referee"
  on public.referrals for select
  to authenticated
  using (auth.uid() = referrer_user_id or auth.uid() = referee_user_id);

create policy "referrals_admin_all"
  on public.referrals for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Service / Edge: attribute signup to a referrer by profile referral_code
create or replace function public.register_referral_attribution(p_referee_user_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_referrer uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'register_referral_attribution is service_role only';
  end if;
  if length(v_code) < 4 then
    return false;
  end if;
  select p.id into v_referrer
  from public.profiles p
  where p.referral_code = v_code
  limit 1;
  if v_referrer is null or v_referrer = p_referee_user_id then
    return false;
  end if;
  insert into public.referrals (referrer_user_id, referee_user_id, referral_code_snapshot, status)
  values (v_referrer, p_referee_user_id, v_code, 'pending')
  on conflict (referee_user_id) do nothing;
  return true;
end;
$$;

revoke all on function public.register_referral_attribution(uuid, text) from public;
grant execute on function public.register_referral_attribution(uuid, text) to service_role;

-- ── 3. Loyalty (server ledger; clients read-only) ────────────────────────────
create table if not exists public.loyalty_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  points_balance bigint not null default 0 check (points_balance >= 0),
  tier text not null default 'bronze' check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  current_streak int not null default 0 check (current_streak >= 0),
  last_tip_local_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta_points bigint not null,
  reason text not null,
  ref_tip_id uuid references public.tips (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists loyalty_ledger_user_created_idx
  on public.loyalty_ledger (user_id, created_at desc);

create unique index if not exists loyalty_ledger_ref_tip_uidx
  on public.loyalty_ledger (ref_tip_id)
  where ref_tip_id is not null;

alter table public.loyalty_wallets enable row level security;
alter table public.loyalty_ledger enable row level security;

create policy "loyalty_wallets_select_own"
  on public.loyalty_wallets for select
  to authenticated
  using (auth.uid() = user_id);

create policy "loyalty_wallets_admin_select"
  on public.loyalty_wallets for select
  to authenticated
  using (public.is_admin());

create policy "loyalty_ledger_select_own"
  on public.loyalty_ledger for select
  to authenticated
  using (auth.uid() = user_id);

create policy "loyalty_ledger_admin_select"
  on public.loyalty_ledger for select
  to authenticated
  using (public.is_admin());

create or replace function public.apply_loyalty_for_successful_tip(p_payer_id uuid, p_tip_id uuid, p_amount_cents int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pts bigint;
  v_today date := (timezone('Africa/Johannesburg', now()))::date;
  v_prev date;
  v_streak int;
  v_bal bigint;
  v_tier text;
  v_ledger_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'apply_loyalty_for_successful_tip is service_role only';
  end if;
  if p_payer_id is null or p_amount_cents is null or p_amount_cents <= 0 then
    return;
  end if;
  perform pg_advisory_xact_lock(884422, hashtext(p_tip_id::text));
  v_pts := greatest(1::bigint, (p_amount_cents / 500)::bigint);

  insert into public.loyalty_wallets (user_id, points_balance, tier, current_streak, last_tip_local_date, updated_at)
  values (p_payer_id, 0, 'bronze', 0, null, now())
  on conflict (user_id) do nothing;

  begin
    insert into public.loyalty_ledger (user_id, delta_points, reason, ref_tip_id, meta)
    values (
      p_payer_id,
      v_pts,
      'tip_success',
      p_tip_id,
      '{}'::jsonb
    )
    returning id into v_ledger_id;
  exception
    when unique_violation then
      return;
  end;

  select last_tip_local_date, current_streak into v_prev, v_streak
  from public.loyalty_wallets where user_id = p_payer_id for update;

  if v_prev is null then
    v_streak := 1;
  elsif v_prev = v_today then
    null;
  elsif v_prev = v_today - 1 then
    v_streak := v_streak + 1;
  else
    v_streak := 1;
  end if;

  update public.loyalty_wallets lw
  set
    points_balance = lw.points_balance + v_pts,
    current_streak = v_streak,
    last_tip_local_date = v_today,
    updated_at = now()
  where lw.user_id = p_payer_id
  returning lw.points_balance into v_bal;

  v_tier := case
    when v_bal >= 20000 then 'platinum'
    when v_bal >= 5000 then 'gold'
    when v_bal >= 1000 then 'silver'
    else 'bronze'
  end;

  update public.loyalty_wallets set tier = v_tier where user_id = p_payer_id;

  update public.loyalty_ledger
  set meta = jsonb_build_object('amount_cents', p_amount_cents, 'streak', v_streak, 'tier', v_tier)
  where id = v_ledger_id;
end;
$$;

revoke all on function public.apply_loyalty_for_successful_tip(uuid, uuid, int) from public;
grant execute on function public.apply_loyalty_for_successful_tip(uuid, uuid, int) to service_role;

-- ── 4. KYC / verification cases (workflow; documents live in Storage + meta) ───
create table if not exists public.kyc_cases (
  id uuid primary key default gen_random_uuid(),
  party_type text not null check (party_type in ('user', 'guard', 'merchant')),
  party_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'approved', 'rejected')),
  risk_score int not null default 0 check (risk_score >= 0 and risk_score <= 100),
  provider text,
  data jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kyc_cases_party_idx on public.kyc_cases (party_type, party_id);
create index if not exists kyc_cases_status_idx on public.kyc_cases (status, created_at desc);

drop trigger if exists trg_kyc_cases_updated on public.kyc_cases;
create trigger trg_kyc_cases_updated
  before update on public.kyc_cases
  for each row execute function public.set_updated_at();

alter table public.kyc_cases enable row level security;

create policy "kyc_select_admin"
  on public.kyc_cases for select
  to authenticated
  using (public.is_admin());

create policy "kyc_select_own_guard"
  on public.kyc_cases for select
  to authenticated
  using (
    party_type = 'guard'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  );

create policy "kyc_select_own_merchant"
  on public.kyc_cases for select
  to authenticated
  using (
    party_type = 'merchant'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  );

create policy "kyc_select_own_user"
  on public.kyc_cases for select
  to authenticated
  using (party_type = 'user' and party_id = auth.uid());

create policy "kyc_insert_own_guard_draft"
  on public.kyc_cases for insert
  to authenticated
  with check (
    party_type = 'guard'
    and status = 'draft'
    and exists (select 1 from public.guards g where g.id = party_id and g.user_id = auth.uid())
  );

create policy "kyc_insert_own_merchant_draft"
  on public.kyc_cases for insert
  to authenticated
  with check (
    party_type = 'merchant'
    and status = 'draft'
    and exists (select 1 from public.merchants m where m.id = party_id and m.user_id = auth.uid())
  );

create policy "kyc_update_own_guard_draft"
  on public.kyc_cases for update
  to authenticated
  using (
    party_type = 'guard'
    and status = 'draft'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  )
  with check (
    party_type = 'guard'
    and status = 'draft'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  );

create policy "kyc_guard_submit_for_review"
  on public.kyc_cases for update
  to authenticated
  using (
    party_type = 'guard'
    and status = 'draft'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  )
  with check (
    party_type = 'guard'
    and status = 'submitted'
    and exists (select 1 from public.guards g where g.id = kyc_cases.party_id and g.user_id = auth.uid())
  );

create policy "kyc_update_own_merchant_draft"
  on public.kyc_cases for update
  to authenticated
  using (
    party_type = 'merchant'
    and status = 'draft'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  )
  with check (
    party_type = 'merchant'
    and status = 'draft'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  );

create policy "kyc_merchant_submit_for_review"
  on public.kyc_cases for update
  to authenticated
  using (
    party_type = 'merchant'
    and status = 'draft'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  )
  with check (
    party_type = 'merchant'
    and status = 'submitted'
    and exists (select 1 from public.merchants m where m.id = kyc_cases.party_id and m.user_id = auth.uid())
  );

create policy "kyc_admin_all"
  on public.kyc_cases for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── 5. Analytics events (append-only; writers = service_role / Edge) ──────────
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  guard_id uuid references public.guards (id) on delete set null,
  merchant_id uuid references public.merchants (id) on delete set null,
  event text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event, created_at desc);

create index if not exists analytics_events_guard_created_idx
  on public.analytics_events (guard_id, created_at desc)
  where guard_id is not null;

alter table public.analytics_events enable row level security;

revoke insert, update, delete on public.analytics_events from anon, authenticated;

create policy "analytics_events_admin_select"
  on public.analytics_events for select
  to authenticated
  using (public.is_admin());

-- ── 6. Merchant onboarding + server-owned fields ─────────────────────────────
alter table public.merchants
  add column if not exists onboarding_stage text not null default 'draft'
    check (onboarding_stage in ('draft', 'submitted', 'under_review', 'approved', 'suspended')),
  add column if not exists company_registration text,
  add column if not exists vat_number text,
  add column if not exists paystack_subaccount_code text,
  add column if not exists settlement_notes text;

create or replace function public.merchants_block_sensitive_client_mutations()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.verified := false;
    new.paystack_subaccount_code := null;
    new.onboarding_stage := 'draft';
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.verified is distinct from old.verified
      or new.paystack_subaccount_code is distinct from old.paystack_subaccount_code
    then
      raise exception 'merchant verification or Paystack subaccount cannot be changed from the client';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_merchants_block_sensitive on public.merchants;
create trigger trg_merchants_block_sensitive
  before insert or update on public.merchants
  for each row
  execute function public.merchants_block_sensitive_client_mutations();

-- Allow merchant to move draft → submitted once (client path for onboarding UX)
create or replace function public.merchant_submit_onboarding()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.onboarding_stage is distinct from old.onboarding_stage then
    if old.onboarding_stage = 'draft'
      and new.onboarding_stage = 'submitted'
      and auth.uid() = old.user_id
    then
      return new;
    end if;
    raise exception 'invalid onboarding_stage transition';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_merchant_submit_onboarding on public.merchants;
create trigger trg_merchant_submit_onboarding
  before update on public.merchants
  for each row
  execute function public.merchant_submit_onboarding();

-- ── 7. Tip sessions: payment surface (QR / wallets / NFC prep) ─────────────────
alter table public.tip_sessions
  add column if not exists payment_surface text not null default 'web'
    check (payment_surface in ('web', 'qr', 'apple_pay', 'google_pay', 'nfc_preparing', 'rfid'));

comment on column public.tip_sessions.payment_surface is
  'Checkout entry surface: drives UX + future routing; NFC/RFID map to hardware flows.';

-- ── 8. Settlement hooks (loyalty + immutable audit + analytics) ────────────────
create or replace function public.post_tip_settlement_hooks(p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tip public.tips%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'post_tip_settlement_hooks is service_role only';
  end if;

  select * into v_tip
  from public.tips
  where paystack_reference = p_reference and status = 'succeeded'
  limit 1;

  if not found then
    return;
  end if;

  if v_tip.payer_id is not null then
    perform public.apply_loyalty_for_successful_tip(v_tip.payer_id, v_tip.id, v_tip.amount_cents);
  end if;

  insert into public.analytics_events (user_id, guard_id, event, properties)
  values (
    v_tip.payer_id,
    v_tip.guard_id,
    'tip.settled',
    jsonb_build_object(
      'tip_id', v_tip.id,
      'amount_cents', v_tip.amount_cents,
      'reference', p_reference
    )
  );

  insert into public.activity_logs (user_id, action, entity_type, entity_id, meta)
  values (
    v_tip.payer_id,
    'tip_settled',
    'tip',
    v_tip.id::text,
    jsonb_build_object('paystack_reference', p_reference, 'amount_cents', v_tip.amount_cents)
  );
end;
$$;

revoke all on function public.post_tip_settlement_hooks(text) from public;
grant execute on function public.post_tip_settlement_hooks(text) to service_role;

-- ── 9. Admin KPIs (extend JSON; backward-compatible keys) ──────────────────────
create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'tips_succeeded', (select count(*)::bigint from public.tips where status = 'succeeded'),
    'tips_pending', (select count(*)::bigint from public.tips where status = 'pending'),
    'volume_cents_succeeded', (select coalesce(sum(amount_cents), 0)::bigint from public.tips where status = 'succeeded'),
    'guards_total', (select count(*)::bigint from public.guards),
    'guards_verified', (select count(*)::bigint from public.guards where verified = true),
    'merchants_total', (select count(*)::bigint from public.merchants),
    'merchants_verified', (select count(*)::bigint from public.merchants where verified = true),
    'referrals_total', (select count(*)::bigint from public.referrals),
    'referrals_qualified', (select count(*)::bigint from public.referrals where status in ('qualified', 'rewarded')),
    'loyalty_wallets', (select count(*)::bigint from public.loyalty_wallets),
    'loyalty_points_outstanding', (select coalesce(sum(points_balance), 0)::bigint from public.loyalty_wallets),
    'kyc_open', (select count(*)::bigint from public.kyc_cases where status in ('submitted', 'in_review')),
    'analytics_24h', (
      select count(*)::bigint from public.analytics_events ae
      where ae.created_at > now() - interval '24 hours'
    )
  );
end;
$$;

revoke all on function public.admin_dashboard_metrics() from public;
grant execute on function public.admin_dashboard_metrics() to authenticated;

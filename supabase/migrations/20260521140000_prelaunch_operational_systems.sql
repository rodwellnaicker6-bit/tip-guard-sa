-- TipGuard SA — pre-launch operational systems (retry queue, reconciliation log, payout freeze)

-- ── Failed webhook retry queue (service role / Edge only) ───────────────────
create table if not exists public.webhook_retry_queue (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack',
  event_id text,
  event_type text,
  payload jsonb not null,
  error_message text,
  attempts int not null default 0,
  max_attempts int not null default 5,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  next_retry_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webhook_retry_queue_pending_idx
  on public.webhook_retry_queue (status, next_retry_at)
  where status = 'pending';

alter table public.webhook_retry_queue enable row level security;

revoke all on public.webhook_retry_queue from anon, authenticated;

-- ── Reconciliation audit log (admin read) ───────────────────────────────────
create table if not exists public.reconciliation_log (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  scope text not null,
  matched_count int not null default 0,
  mismatch_count int not null default 0,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists reconciliation_log_run_at_idx
  on public.reconciliation_log (run_at desc);

alter table public.reconciliation_log enable row level security;

create policy "reconciliation_log_admin_select"
  on public.reconciliation_log for select
  to authenticated
  using (public.is_admin());

revoke insert, update, delete on public.reconciliation_log from anon, authenticated;

-- ── Platform payout freeze switch ───────────────────────────────────────────
alter table public.platform_settings
  add column if not exists payouts_frozen boolean not null default false;

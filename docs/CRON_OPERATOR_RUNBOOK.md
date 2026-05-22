# Cron operator runbook (Supabase Dashboard)

**Project:** `fyjmujhlqpvfryelnfum`  
**Timezone:** Schedules below use **UTC** in pg_cron; business meaning is **SAST** (Africa/Johannesburg, UTC+2, no DST).

| Job | UTC cron | SAST local |
|-----|----------|------------|
| Webhook retries | `*/15 * * * *` | Every 15 minutes |
| Daily reconcile | `0 0 * * *` | **02:00** daily |

Executable SQL: `scripts/schedule-cron-jobs.sql` · reference: [CRON.md](./CRON.md).

---

## A. One-time: Vault secret for cron auth

1. Open [Supabase Dashboard](https://supabase.com/dashboard/project/fyjmujhlqpvfryelnfum) → **Project Settings** → **API**.
2. Copy **service_role** key (never paste into Vercel or client code).
3. Go to **SQL Editor** → New query → run (once):

```sql
select vault.create_secret(
  'YOUR_SERVICE_ROLE_KEY_HERE',
  'service_role_key',
  'TipGuard cron auth'
);
```

4. Confirm: `select name from vault.secrets where name = 'service_role_key';`

---

## B. Enable extensions

1. **Database** → **Extensions**.
2. Enable **pg_cron** and **pg_net** (if not already from migration `20260625200000`).

---

## C. Schedule jobs (SQL Editor)

1. **SQL Editor** → paste full contents of `scripts/schedule-cron-jobs.sql`.
2. Replace project URL in file if ref changes (currently `fyjmujhlqpvfryelnfum`).
3. **Run**.
4. Verify:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname like 'tipguard-%';
```

Expect two rows: `tipguard-webhook-retries`, `tipguard-reconcile-daily`.

---

## D. Alternative: Integrations → Cron (HTTP POST)

1. Dashboard → **Integrations** → **Cron** → **Create job**.
2. **Webhook retries**
   - Name: `TipGuard webhook retries`
   - Schedule: every 15 minutes
   - Method: POST
   - URL: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/process-webhook-retries`
   - Header: `Authorization: Bearer <SERVICE_ROLE_KEY>`
   - Header: `Content-Type: application/json`
   - Body: `{}`
3. **Daily reconcile**
   - Name: `TipGuard daily reconcile`
   - Schedule: `0 0 * * *` UTC (02:00 SAST)
   - URL: `https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/reconcile-daily`
   - Same headers and body `{}`

Do **not** duplicate both SQL pg_cron and Dashboard cron for the same function unless you intend double runs.

---

## E. Verify within 24h

1. **Edge Functions** → `process-webhook-retries` → **Logs** — at least one 200 after 15 min.
2. **Edge Functions** → `reconcile-daily` — 200 after first 02:00 SAST run (or manual POST below).
3. **SQL:**

```sql
select run_at, scope, matched_count, mismatch_count
from public.reconciliation_log
order by run_at desc
limit 3;
```

Manual trigger:

```bash
curl -X POST "https://fyjmujhlqpvfryelnfum.supabase.co/functions/v1/reconcile-daily" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## F. Failure handling

| Symptom | Action |
|---------|--------|
| Cron job inactive | `select * from cron.job_run_details order by end_time desc limit 20;` |
| 401 on Edge | Rotate service role in Vault secret; redeploy not required |
| `mismatch_count > 0` | [RECONCILIATION.md](./RECONCILIATION.md); pause merchant cap per [BETA_ROLLOUT_PLAN.md](./BETA_ROLLOUT_PLAN.md) |
| DLQ growing | [MONITORING.md](./MONITORING.md); `/admin/fraud` |

---

## Related

- [OPERATOR_DAILY_CHECKLIST.md](./OPERATOR_DAILY_CHECKLIST.md)
- [WEBHOOK_RETRY_QUEUE.md](./WEBHOOK_RETRY_QUEUE.md)

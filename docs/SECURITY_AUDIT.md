# Security audit — RLS & FK summary

**Audit date:** 22 May 2026  
**Scope:** `supabase/migrations/` (28 files), `npm run verify:supabase`  
**Project:** `fyjmujhlqpvfryelnfum`

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| RLS on financial tables | **OK** | `tips`, `transactions`, `payment_events`, wallets — client writes blocked or scoped |
| `payment_events` anon access | **OK** | `20260625180000` revokes anon SELECT; verify script confirms block |
| `tips` client writes | **OK** | `tips_require_privileged_writer` trigger |
| Internal ops tables | **OK** | `api_rate_log`, webhook dedupe — RLS + revoke from anon/authenticated |
| `guards` broad SELECT | **Caveat (P2)** | `guards_select_authenticated` — any signed-in user reads full guard rows; use `guards_public_directory` when tightening |
| FK integrity | **OK** | Cascades on merchant-scoped children; `auth.users` references use ON DELETE SET NULL/CASCADE appropriately |
| Views | **OK** | `guards_public_directory` uses `security_invoker = true` |
| P0 fixes this pass | **None** | No trivial RLS gap requiring code change |

---

## RLS highlights (by migration era)

### Init + security critical (`20250512*`, `20260209*`)

- Core `profiles`, `guards`, `tips` policies
- Role escalation blocked on `profiles`
- `api_rate_log`, `stripe_webhook_events` locked down

### Paystack + wallets (`20260211*`, `20260210*`)

- Paystack webhook dedupe tables
- Wallet / payout request policies

### Launch hardening (`20260622*` – `20260626*`)

- Payment QR production: `qr_codes`, `tip_sessions`, merchant FKs
- `payment_events` RLS + **hotfix** anon revoke (`20260625180000`)
- Financial ops: disputes, reconciliation, webhook retry queue
- Admin payout RPC `admin_update_payout_status` (`20260625200000`)
- Guard Paystack recipient columns (`20260626100000`) — no new policies (columns on `guards` inherit existing guard policies)

---

## Foreign keys (representative)

| Child table | Parent | ON DELETE |
|-------------|--------|-----------|
| `guards` | `auth.users` | CASCADE (profile chain) |
| `qr_codes` | `merchants` | CASCADE |
| `tips` | `guards`, `merchants`, `qr_codes` | SET NULL / CASCADE per column |
| `transactions` | `tips` | SET NULL |
| `payout_requests` | `guards` | CASCADE |
| `merchant_invites` | `merchants` | CASCADE |
| `disputes` | `merchants`, `tips` | CASCADE / SET NULL |
| `audit_log.actor_id` | `auth.users` | SET NULL |

No orphan-prone FK found without index on high-traffic paths; launch indexes in `20260621110000`, `20260625160000`.

---

## Automated verification

```
npm run verify:supabase
✓ RLS payment_events (anon blocked)
✓ RLS guards (anon read — public directory pattern)
✓ RPC resolve_tip_target, claim_tip_link_session, regenerate_qr_code_token
```

---

## App-layer guards (defense in depth)

| Prefix | Guard |
|--------|-------|
| `/admin/*` | `RequireAdmin` |
| `/guard/*` | `RequireAuth` + `RequireGuard` |
| `/merchant/*` | `RequireAuth` + `RequireMerchant` |
| `/customer/*` | `RequireAuth` |

---

## Post-launch recommendations (non-P0)

1. Revoke `guards_select_authenticated` after clients use `guards_public_directory` / RPC
2. JWT fixture tests per role for RLS regression
3. Document policies for each new table in migration PR template
4. Enable Supabase advisors / leaked-password protection in Dashboard

---

## Related

- [RLS_AUDIT.md](./RLS_AUDIT.md) — detailed policy names
- [MIGRATIONS_AND_RLS.md](./MIGRATIONS_AND_RLS.md) — push procedures
- [SESSION_SECURITY.md](./SESSION_SECURITY.md)

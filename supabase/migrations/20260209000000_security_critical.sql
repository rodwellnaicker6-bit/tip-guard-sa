-- =============================================================================
-- TipGuard SA — critical security hardening (incremental migration)
-- =============================================================================
-- WHAT: RLS for internal-only tables, revoke client grants, safe profile roles,
--       guard financial/Connect field protection, stricter guard INSERT policy,
--       defense-in-depth on tips mutations, Stripe webhook lookup index.
-- WHY:  Production RLS previously allowed broad guard reads and left internal
--       webhook/rate tables without RLS; profiles trusted raw_user_meta_data
--       for role; clients could inflate balances or flip verification flags.
-- GUARD SIGNUP PATH (role is never taken from user-controlled metadata on
--       signup): auth trigger inserts profiles.role = 'customer' only. An
--       admin (authenticated + profiles.role = 'admin') updates the profile
--       to 'guard', or the same change is applied with the service_role key
--       from a trusted server path. The guard then completes GuardSetup.
-- =============================================================================

-- ── Stripe Connect: fast, safe lookup for account.updated webhooks ─────────
-- WHAT: Unique partial index on guards.stripe_account_id (non-null only).
-- WHY:  Webhook updates use .eq("stripe_account_id", acct.id); uniqueness
--       prevents two guards from sharing one Connect account by mistake.
CREATE UNIQUE INDEX IF NOT EXISTS guards_stripe_account_id_uidx
  ON public.guards (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- ── Auth signup: never trust raw_user_meta_data for privilege ───────────────
-- WHAT: Replace handle_new_user so new profiles always get role 'customer'.
-- WHY:  Client-supplied metadata must not create admin/guard accounts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (
    NEW.id,
    'customer',
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
      'Member'
    )
  );
  RETURN NEW;
END;
$$;

-- ── Profiles: default role on any non-admin client INSERT ──────────────────
-- WHAT: BEFORE INSERT trigger forcing role = customer unless service_role or
--       an authenticated admin is performing the insert.
-- WHY:  Defense in depth if profiles are inserted outside handle_new_user.
CREATE OR REPLACE FUNCTION public.profile_enforce_customer_role_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
      NEW.role := 'customer';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_enforce_customer_role_on_insert ON public.profiles;
CREATE TRIGGER profile_enforce_customer_role_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  execute function public.profile_enforce_customer_role_on_insert();

-- ── Profiles: block self-service role changes (escalation / lateral move) ──
-- WHAT: BEFORE UPDATE trigger; only service_role or is_admin() may change role.
-- WHY:  RLS allows users to update their own row for name/phone — not role.
CREATE OR REPLACE FUNCTION public.profile_prevent_client_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() = 'service_role' OR public.is_admin() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'profile role cannot be changed without admin or service role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profile_prevent_client_role_change ON public.profiles;
CREATE TRIGGER profile_prevent_client_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  execute function public.profile_prevent_client_role_change();

-- ── Guards: clients cannot forge balances, tips, verification, or Connect ──
-- WHAT: BEFORE INSERT OR UPDATE trigger locking server-owned columns unless
--       service_role or admin.
-- WHY:  RLS policies allowed guard owners to UPDATE any column; inserts could
--       set arbitrary balance_cents. Edge Functions use service_role and bypass
--       RLS but still pass this trigger with auth.role() = 'service_role'.
CREATE OR REPLACE FUNCTION public.guards_block_sensitive_client_mutations()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.balance_cents := 0;
    NEW.tips_count := 0;
    NEW.verified := FALSE;
    NEW.rating := LEAST(GREATEST(COALESCE(NEW.rating, 4.5), 0), 5);
    NEW.stripe_account_id := NULL;
    NEW.connect_charges_enabled := FALSE;
    NEW.connect_onboarding_status := COALESCE(NEW.connect_onboarding_status, 'not_started');
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.balance_cents IS DISTINCT FROM OLD.balance_cents
      OR NEW.tips_count IS DISTINCT FROM OLD.tips_count
      OR NEW.verified IS DISTINCT FROM OLD.verified
      OR NEW.rating IS DISTINCT FROM OLD.rating
      OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
      OR NEW.connect_charges_enabled IS DISTINCT FROM OLD.connect_charges_enabled
      OR NEW.connect_onboarding_status IS DISTINCT FROM OLD.connect_onboarding_status
    THEN
      RAISE EXCEPTION 'cannot modify guard ledger, verification, rating, or Connect fields from the client';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guards_block_sensitive_client_mutations ON public.guards;
CREATE TRIGGER guards_block_sensitive_client_mutations
  BEFORE INSERT OR UPDATE ON public.guards
  FOR EACH ROW
  execute function public.guards_block_sensitive_client_mutations();

-- ── Guards INSERT policy: explicit WITH CHECK (RLS layer) ───────────────────
-- WHAT: Replace guards_insert_own with stricter WITH CHECK on financial defaults.
-- WHY:  Aligns RLS with triggers so misconfiguration does not allow forged rows.
DROP POLICY IF EXISTS "guards_insert_own" ON public.guards;

CREATE POLICY "guards_insert_own"
  ON public.guards FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND balance_cents = 0
    AND tips_count = 0
    AND verified = FALSE
    AND connect_charges_enabled = FALSE
    AND connect_onboarding_status = 'not_started'
    AND stripe_account_id IS NULL
  );

-- ── Tips: server-side writes only (RLS + trigger) ────────────────────────────
-- WHAT: BEFORE INSERT/UPDATE/DELETE on tips — allow only service_role or admin.
-- WHY:  Tips rows and status transitions must not be forged or deleted by anon
--       or normal customers; Edge Functions and webhooks use service_role.
CREATE OR REPLACE FUNCTION public.tips_require_privileged_writer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tips are managed server-side only';
END;
$$;

DROP TRIGGER IF EXISTS tips_require_privileged_writer ON public.tips;
CREATE TRIGGER tips_require_privileged_writer
  BEFORE INSERT OR UPDATE OR DELETE ON public.tips
  FOR EACH ROW
  execute function public.tips_require_privileged_writer();

-- ── Internal ops tables: RLS on + no REST access for anon/authenticated ─────
-- WHAT: Enable RLS on api_rate_log and stripe_webhook_events; revoke table
--       privileges from anon and authenticated roles.
-- WHY:  These tables are written only by Edge Functions (service_role), which
--       bypasses RLS; clients must not read or write webhook idempotency or
--       rate-limit rows through PostgREST.
ALTER TABLE public.api_rate_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.api_rate_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.stripe_webhook_events FROM anon, authenticated;

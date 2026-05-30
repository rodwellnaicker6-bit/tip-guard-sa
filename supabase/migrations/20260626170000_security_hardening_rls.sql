-- Security hardening: platform_settings RLS + revoke anon on admin/privileged RPCs.
-- Public tip flows (resolve_tip_target, touch_qr_code) remain callable by anon.

alter table public.platform_settings enable row level security;

drop policy if exists "platform_settings_select_authenticated" on public.platform_settings;
create policy "platform_settings_select_authenticated"
  on public.platform_settings for select
  to authenticated
  using (true);

drop policy if exists "platform_settings_admin_write" on public.platform_settings;
create policy "platform_settings_admin_write"
  on public.platform_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admin / wallet / webhook claim — not for anonymous REST callers
revoke execute on function public.admin_dashboard_metrics() from anon;
revoke execute on function public.admin_ops_metrics() from anon;
revoke execute on function public.admin_payment_analytics() from anon;
revoke execute on function public.admin_update_payout_status(uuid, text) from anon;
revoke execute on function public.credit_wallet(uuid, bigint) from anon;
revoke execute on function public.claim_paystack_webhook_event(text, text) from anon;
revoke execute on function public.finalize_tip_from_paystack_reference(text) from anon;
revoke execute on function public.finalize_tip_from_payment_intent(text) from anon;
revoke execute on function public.save_onboarding_role(text) from anon;

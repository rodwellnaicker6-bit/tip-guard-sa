-- Hotfix: payment_events must not be readable by anon (24130000 enabled RLS but left SELECT grant).

revoke select on public.payment_events from anon;

drop policy if exists payment_events_admin_select on public.payment_events;
create policy payment_events_admin_select
  on public.payment_events for select
  to authenticated
  using (public.is_admin());

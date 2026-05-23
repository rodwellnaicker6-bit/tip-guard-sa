-- Allow one-time self-service role selection during onboarding (customer → guard | merchant).
-- WHY: profile_prevent_client_role_change blocked all client role updates; onboarding Continue failed silently.

create or replace function public.profile_prevent_client_role_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' or public.is_admin() then
      return new;
    end if;
    if old.role = 'customer' and new.role in ('customer', 'guard', 'merchant') then
      return new;
    end if;
    raise exception 'profile role cannot be changed without admin or service role';
  end if;
  return new;
end;
$$;

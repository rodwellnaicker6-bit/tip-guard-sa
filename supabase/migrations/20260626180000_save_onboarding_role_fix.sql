-- Onboarding role save: allow correcting guard/merchant pick before any guard/merchant row exists.

create or replace function public.save_onboarding_role(p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
  v_new text;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_role is null or p_role not in ('customer', 'guard', 'merchant') then
    raise exception 'invalid role';
  end if;

  v_name := coalesce(
    nullif(trim(auth.jwt()->'user_metadata'->>'full_name'), ''),
    nullif(trim(split_part(coalesce(auth.jwt()->>'email', ''), '@', 1)), ''),
    'Member'
  );

  insert into public.profiles (id, role, full_name)
  values (v_uid, 'customer', v_name)
  on conflict (id) do nothing;

  select role into v_old from public.profiles where id = v_uid;
  if v_old is null then
    raise exception 'profile row missing after bootstrap';
  end if;

  if v_old is distinct from p_role then
    if auth.role() = 'service_role' or public.is_admin() then
      update public.profiles set role = p_role, updated_at = now() where id = v_uid;
    elsif v_old = 'customer' and p_role in ('customer', 'guard', 'merchant') then
      update public.profiles set role = p_role, updated_at = now() where id = v_uid;
    elsif v_old in ('guard', 'merchant')
      and p_role in ('guard', 'merchant')
      and not exists (select 1 from public.guards g where g.user_id = v_uid)
      and not exists (select 1 from public.merchants m where m.user_id = v_uid) then
      update public.profiles set role = p_role, updated_at = now() where id = v_uid;
    else
      raise exception 'profile role cannot be changed without admin or service role';
    end if;
  end if;

  select role into v_new from public.profiles where id = v_uid;
  return v_new;
end;
$$;

revoke all on function public.save_onboarding_role(text) from public;
grant execute on function public.save_onboarding_role(text) to authenticated;

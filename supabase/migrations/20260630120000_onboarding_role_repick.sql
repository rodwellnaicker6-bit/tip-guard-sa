-- Onboarding: allow guard ↔ merchant re-pick when the target role has no row yet.
-- Cleans orphan draft merchant / unverified guard rows owned by the same user.

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
    elsif v_old in ('guard', 'merchant') and p_role in ('guard', 'merchant') then
      if p_role = 'guard'
        and not exists (select 1 from public.guards g where g.user_id = v_uid) then
        if v_old = 'merchant' then
          delete from public.merchants m
          where m.user_id = v_uid
            and coalesce(m.verified, false) = false;
        end if;
        update public.profiles set role = p_role, updated_at = now() where id = v_uid;
      elsif p_role = 'merchant'
        and not exists (select 1 from public.merchants m where m.user_id = v_uid) then
        if v_old = 'guard' then
          delete from public.guards g
          where g.user_id = v_uid
            and coalesce(g.verified, false) = false
            and not exists (select 1 from public.tips t where t.guard_id = g.id);
        end if;
        update public.profiles set role = p_role, updated_at = now() where id = v_uid;
      elsif not exists (select 1 from public.guards g where g.user_id = v_uid)
        and not exists (select 1 from public.merchants m where m.user_id = v_uid) then
        update public.profiles set role = p_role, updated_at = now() where id = v_uid;
      else
        raise exception 'profile role cannot be changed without admin or service role';
      end if;
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

-- Client fallback updates must mirror RPC guard/merchant re-pick rules.
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
    if old.role in ('guard', 'merchant')
      and new.role in ('guard', 'merchant')
      and not exists (select 1 from public.guards g where g.user_id = new.id)
      and not exists (select 1 from public.merchants m where m.user_id = new.id) then
      return new;
    end if;
    raise exception 'profile role cannot be changed without admin or service role';
  end if;
  return new;
end;
$$;

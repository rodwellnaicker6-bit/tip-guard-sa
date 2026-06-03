-- Ensure merchant KYC draft row exists (Paystack onboarding / compliance demos).
create or replace function public.ensure_merchant_kyc_draft(p_merchant_id uuid)
returns table (id uuid, status text, data jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.kyc_cases%rowtype;
begin
  if p_merchant_id is null then
    raise exception 'merchant_id required';
  end if;

  if not exists (
    select 1 from public.merchants m
    where m.id = p_merchant_id and m.user_id = auth.uid()
  ) and not public.is_admin() then
    raise exception 'not authorized for merchant %', p_merchant_id;
  end if;

  select * into v_row
  from public.kyc_cases k
  where k.party_type = 'merchant' and k.party_id = p_merchant_id
  order by k.created_at desc
  limit 1;

  if v_row.id is null then
    insert into public.kyc_cases (party_type, party_id, status, data)
    values ('merchant', p_merchant_id, 'draft', '{}'::jsonb)
    returning * into v_row;
  end if;

  return query
  select v_row.id, v_row.status, v_row.data, v_row.updated_at;
end;
$$;

revoke all on function public.ensure_merchant_kyc_draft(uuid) from public;
grant execute on function public.ensure_merchant_kyc_draft(uuid) to authenticated;

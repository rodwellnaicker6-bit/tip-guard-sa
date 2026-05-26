-- PostgREST embed: guards.merchant_id → merchants (schema cache / relationship hint)
-- Idempotent: safe if 20260622100000 already applied.

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'guards'
      and c.conname = 'guards_merchant_id_fkey'
  ) then
    alter table public.guards
      add constraint guards_merchant_id_fkey
      foreign key (merchant_id) references public.merchants (id) on delete set null;
  end if;
end $$;

-- Reload API schema cache after FK is visible (Supabase hosted)
notify pgrst, 'reload schema';

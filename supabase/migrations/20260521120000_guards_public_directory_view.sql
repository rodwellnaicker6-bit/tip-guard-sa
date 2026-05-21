-- TipGuard SA — RLS hardening scaffold: public guard directory view (security invoker)
-- Does NOT remove guards_select_authenticated (breaking for existing clients).
-- Prefer list_public_guards() RPC or this view for customer discovery.

create or replace view public.guards_public_directory
with (security_invoker = true)
as
  select
    g.id,
    g.display_name,
    g.location,
    g.province,
    g.avatar_initials,
    g.verified,
    g.rating,
    g.tips_count
  from public.guards g
  where g.verified = true;

comment on view public.guards_public_directory is
  'Customer-safe guard columns only. RLS on underlying guards table still applies (security invoker).';

grant select on public.guards_public_directory to anon, authenticated;

-- Neutralize legacy demo locality label in seed guard row (additive, idempotent).
update public.guards
set location = 'Metropolitan retail precinct, Gauteng'
where id = 'a0000001-0000-4000-8000-000000000001'
  and location = 'Sandton City, JHB';

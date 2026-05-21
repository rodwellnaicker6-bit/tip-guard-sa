create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- ── guards ───────────────────────────────────────────────────────────────────
create table if not exists public.guards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null unique,
  display_name text not null,
  location text,
  province text,
  avatar_initials text,
  verified boolean not null default false,
  rating numeric(3,2) not null default 4.5,
  tips_count int not null default 0,
  balance_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.guards enable row level security;

drop policy if exists "guards_select_authenticated" on public.guards;
create policy "guards_select_authenticated" on public.guards for select to authenticated using (true);

drop policy if exists "guards_select_public_verified" on public.guards;
create policy "guards_select_public_verified" on public.guards for select to anon using (verified = true);

-- ── tip_links (if missing) ───────────────────────────────────────────────────
create table if not exists public.tip_links (
  id uuid primary key default gen_random_uuid(),
  guard_id uuid not null references public.guards (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '400 days'),
  scan_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.tip_links enable row level security;

alter table public.tip_links add column if not exists last_scanned_at timestamptz;
alter table public.qr_codes add column if not exists last_scanned_at timestamptz;

-- ── is_admin + signup trigger ────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'customer',
    coalesce(new.raw_user_meta_data->>'full_name', nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── storage: guard photos ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public) values ('guard-photos', 'guard-photos', true)
on conflict (id) do nothing;

drop policy if exists "guard_photos_public_read" on storage.objects;
create policy "guard_photos_public_read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'guard-photos');

-- ── RPCs used by app (minimal) ───────────────────────────────────────────────
create or replace function public.touch_tip_link(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.tip_links set scan_count = scan_count + 1, last_scanned_at = now()
  where token = p_token and expires_at > now();
end;
$$;
grant execute on function public.touch_tip_link(text) to anon, authenticated;

create or replace function public.touch_qr_code(p_code_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.qr_codes set scan_count = scan_count + 1, last_scanned_at = now()
  where code_token = p_code_token;
end;
$$;
grant execute on function public.touch_qr_code(text) to anon, authenticated;

create or replace function public.list_public_guards()
returns table (
  id uuid, display_name text, location text, province text,
  avatar_initials text, verified boolean, rating numeric, tips_count int
) language sql stable security definer set search_path = public as $$
  select g.id, g.display_name, g.location, g.province, g.avatar_initials, g.verified, g.rating, g.tips_count
  from public.guards g where g.verified = true order by g.display_name;
$$;
grant execute on function public.list_public_guards() to anon, authenticated;

-- Launch default: 2% platform fee (200 basis points). Safe to re-run.
insert into public.platform_settings (id, fee_bps, updated_at)
values (1, 200, now())
on conflict (id) do update
set fee_bps = 200, updated_at = now();

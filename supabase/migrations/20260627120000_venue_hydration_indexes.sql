-- Tip / venue hydration: indexes for resolve_tip_target hot paths (IF NOT EXISTS safe on re-apply).

-- QR token lookup (guard_staff / location / dynamic)
create index if not exists qr_codes_code_token_active_idx
  on public.qr_codes (code_token)
  where revoked_at is null;

create index if not exists qr_codes_guard_id_active_idx
  on public.qr_codes (guard_id)
  where guard_id is not null and revoked_at is null;

-- Legacy tip_links token path
create index if not exists tip_links_token_expires_idx
  on public.tip_links (token, expires_at);

-- Merchant venue QR lateral pick (verified guards per merchant/location)
create index if not exists guards_merchant_location_verified_idx
  on public.guards (merchant_id, location_id, created_at)
  where verified = true;

-- Merchant hub hydration (user_id lookup)
create index if not exists merchants_user_id_idx
  on public.merchants (user_id);

-- Profile row fetch during auth hydration
create index if not exists profiles_id_role_idx
  on public.profiles (id)
  include (role, full_name, phone);

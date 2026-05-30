-- Align production with app selects (MerchantDashboard risk badge).
alter table public.merchants
  add column if not exists risk_score int not null default 0 check (risk_score >= 0 and risk_score <= 100);

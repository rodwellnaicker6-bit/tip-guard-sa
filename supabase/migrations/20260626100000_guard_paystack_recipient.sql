-- Paystack transfer recipient code for guard payout automation
alter table public.guards
  add column if not exists paystack_recipient_code text,
  add column if not exists payout_bank_code text,
  add column if not exists payout_account_number text,
  add column if not exists payout_account_name text;

comment on column public.guards.paystack_recipient_code is
  'Paystack transfer recipient code (RCP_…); set by request-payout or operator.';

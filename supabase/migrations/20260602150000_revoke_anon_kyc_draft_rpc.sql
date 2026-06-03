-- Paystack review: KYC draft RPC must not be callable without authentication.
revoke execute on function public.ensure_merchant_kyc_draft(uuid) from anon;

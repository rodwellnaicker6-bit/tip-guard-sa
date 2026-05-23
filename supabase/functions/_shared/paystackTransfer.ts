/** Paystack Transfer API helpers (ZAR). Requires PAYSTACK_SECRET_KEY. */

export type PaystackApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

async function paystackFetch<T>(
  secret: string,
  path: string,
  init?: RequestInit,
): Promise<PaystackApiResult<T>> {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({})) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || json.status === false) {
    return {
      ok: false,
      status: res.status,
      message: json.message ?? `Paystack ${path} failed (${res.status})`,
    };
  }
  return { ok: true, data: json.data as T };
}

export type TransferRecipientInput = {
  name: string;
  account_number: string;
  bank_code: string;
};

export async function createTransferRecipient(
  secret: string,
  input: TransferRecipientInput,
): Promise<PaystackApiResult<{ recipient_code: string }>> {
  return paystackFetch(secret, "/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "basa",
      name: input.name,
      account_number: input.account_number,
      bank_code: input.bank_code,
      currency: "ZAR",
    }),
  });
}

export async function initiateTransfer(
  secret: string,
  opts: { recipientCode: string; amountCents: number; reason: string; reference: string },
): Promise<PaystackApiResult<{ transfer_code: string; id: number }>> {
  return paystackFetch(secret, "/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: opts.amountCents,
      recipient: opts.recipientCode,
      reason: opts.reason,
      reference: opts.reference,
      currency: "ZAR",
    }),
  });
}

export function transfersConfigured(secret: string | undefined): boolean {
  return Boolean(secret?.trim());
}

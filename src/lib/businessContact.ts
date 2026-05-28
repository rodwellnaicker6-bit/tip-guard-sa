/** Public operator contact details for Paystack / POPIA compliance pages. */

export type BusinessContact = {
  legalName: string;
  supportEmail: string;
  phone: string;
  address: string;
  /** True when phone or address still use template placeholders. */
  needsOperatorUpdate: boolean;
};

const PLACEHOLDER_PHONE = "+27 00 000 0000";
const PLACEHOLDER_ADDRESS = "123 Example Street, Sandton, Gauteng 2196, South Africa";

function env(key: string): string | undefined {
  const v = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined)?.trim();
  return v || undefined;
}

export function getBusinessContact(): BusinessContact {
  const supportEmail = env("VITE_SUPPORT_EMAIL") ?? "support@tipguard.co.za";
  const phone = env("VITE_BUSINESS_PHONE") ?? PLACEHOLDER_PHONE;
  const address = env("VITE_BUSINESS_ADDRESS") ?? PLACEHOLDER_ADDRESS;
  const legalName = env("VITE_BUSINESS_LEGAL_NAME") ?? "TipGuard SA (Pty) Ltd";
  const needsOperatorUpdate =
    !env("VITE_BUSINESS_PHONE") || !env("VITE_BUSINESS_ADDRESS") || !env("VITE_BUSINESS_LEGAL_NAME");

  return { legalName, supportEmail, phone, address, needsOperatorUpdate };
}

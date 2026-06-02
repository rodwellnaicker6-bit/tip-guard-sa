/** Public operator contact details for Paystack / POPIA compliance pages. */

import { OPERATOR_CONTACT } from "../config/operatorContact";

export type BusinessContact = {
  legalName: string;
  supportEmail: string;
  phone: string;
  address: string;
};

function env(key: string): string | undefined {
  const v = (import.meta.env[key as keyof ImportMetaEnv] as string | undefined)?.trim();
  return v || undefined;
}

export function getBusinessContact(): BusinessContact {
  return {
    legalName: env("VITE_BUSINESS_LEGAL_NAME") ?? OPERATOR_CONTACT.legalName,
    supportEmail: env("VITE_SUPPORT_EMAIL") ?? OPERATOR_CONTACT.supportEmail,
    phone: env("VITE_BUSINESS_PHONE") ?? OPERATOR_CONTACT.phone,
    address: env("VITE_BUSINESS_ADDRESS") ?? OPERATOR_CONTACT.address,
  };
}

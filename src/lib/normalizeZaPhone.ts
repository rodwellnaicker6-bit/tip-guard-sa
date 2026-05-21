/** E.164-ish normalisation for ZA mobile OTP flows. */
export function normalizeZaPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("27")) return `+${digits}`;
  if (digits.startsWith("0")) return `+27${digits.slice(1)}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return `+27${digits}`;
}

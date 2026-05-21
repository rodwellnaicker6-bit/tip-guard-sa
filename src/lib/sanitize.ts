function stripControlChars(value: string): string {
  return [...value]
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c !== 127;
    })
    .join("");
}

/** Strip control chars and cap length for user-submitted text fields. */
export function sanitizeTextInput(value: string, maxLen = 500): string {
  return stripControlChars(value.trim().slice(0, maxLen));
}

/** Business / location names — slightly shorter cap. */
export function sanitizeDisplayName(value: string): string {
  return sanitizeTextInput(value, 120);
}

/** Email: trim + lowercase; validation remains on the form / Supabase. */
export function sanitizeEmail(value: string): string {
  return sanitizeTextInput(value, 254).toLowerCase();
}

/** Non-PII device stub for fraud metadata — never throws. */
export async function getDeviceFingerprintHash(): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const raw = [
      navigator.userAgent,
      navigator.language,
      String(screen.width),
      String(screen.height),
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    ].join("|");
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  } catch {
    return null;
  }
}

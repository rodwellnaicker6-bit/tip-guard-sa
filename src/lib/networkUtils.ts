/** True when an error message likely indicates a transient network failure. */
export function isTransientNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("offline") ||
    m.includes("failed to send") ||
    m.includes("load failed")
  );
}

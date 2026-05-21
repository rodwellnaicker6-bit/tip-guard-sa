import { useOnlineStatus } from "../hooks/useOnlineStatus";

/** Fixed strip when the device reports offline — does not block interaction. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      className="offline-banner"
      role="status"
      aria-live="polite"
    >
      You&apos;re offline. Some actions may fail until your connection returns.
    </div>
  );
}

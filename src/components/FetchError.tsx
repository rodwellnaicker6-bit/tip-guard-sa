type Props = {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

/** User-facing fetch error with optional retry — no server logs. */
export function FetchError({ message, onRetry, retryLabel = "Try again" }: Props) {
  return (
    <div className="error-panel" role="alert">
      <p className="error">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-ghost tap-target w-full" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function SlowLoadHint({ show, message = "Still loading…" }: { show: boolean; message?: string }) {
  if (!show) return null;
  return (
    <p className="text-center text-xs text-amber-300/90" role="status">
      {message}
    </p>
  );
}

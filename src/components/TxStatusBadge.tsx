/** Compact status pill for transaction / tip rows. */
export function TxStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === "succeeded"
      ? "tx-badge tx-badge--ok"
      : s === "pending"
        ? "tx-badge tx-badge--pending"
        : s === "failed"
          ? "tx-badge tx-badge--fail"
          : "tx-badge";
  return <span className={cls}>{status}</span>;
}

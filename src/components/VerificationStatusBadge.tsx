type VerificationState = "pending" | "approved" | "rejected" | "draft" | "submitted" | "in_review" | string | null | undefined;

const LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending review", className: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
  draft: { label: "Draft", className: "text-slate-300 border-white/15 bg-white/5" },
  submitted: { label: "Submitted", className: "text-sky-300 border-sky-500/30 bg-sky-500/10" },
  in_review: { label: "In review", className: "text-sky-300 border-sky-500/30 bg-sky-500/10" },
  approved: { label: "Approved", className: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
  rejected: { label: "Rejected", className: "text-red-300 border-red-500/30 bg-red-500/10" },
};

/** Maps DB `verified` flag or KYC `status` to a consistent badge. */
export function VerificationStatusBadge({
  verified,
  kycStatus,
  entityLabel = "Verification",
}: {
  verified?: boolean | null;
  kycStatus?: VerificationState;
  entityLabel?: string;
}) {
  const normalized = (kycStatus ?? (verified ? "approved" : "pending")).toString().toLowerCase().replace(/\s+/g, "_");
  const style = LABELS[normalized] ?? LABELS.pending;

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${style.className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{entityLabel}</p>
      <p className="font-bold capitalize">{style.label}</p>
    </div>
  );
}

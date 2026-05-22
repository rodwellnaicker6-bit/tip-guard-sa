export type PayoutSchedule = "instant" | "daily" | "weekly" | "monthly";

export const PAYOUT_SCHEDULE_OPTIONS: { value: PayoutSchedule; label: string; description: string }[] = [
  { value: "instant", label: "Instant", description: "Request payouts when your balance is ready." },
  { value: "daily", label: "Daily", description: "Automatic batch each business day." },
  { value: "weekly", label: "Weekly", description: "Automatic batch every Monday." },
  { value: "monthly", label: "Monthly", description: "Automatic batch on the 1st of each month." },
];

export function isPayoutSchedule(v: string): v is PayoutSchedule {
  return PAYOUT_SCHEDULE_OPTIONS.some((o) => o.value === v);
}

/** Next scheduled batch (local calendar); null for instant / on-demand. */
export function computeNextPayoutAt(schedule: PayoutSchedule, from = new Date()): string | null {
  if (schedule === "instant") return null;

  const next = new Date(from);
  next.setHours(6, 0, 0, 0);

  if (schedule === "daily") {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  if (schedule === "weekly") {
    const day = next.getDay();
    let daysUntilMonday = (8 - day) % 7;
    if (daysUntilMonday === 0 && next <= from) daysUntilMonday = 7;
    next.setDate(next.getDate() + daysUntilMonday);
    return next.toISOString();
  }

  // monthly — 1st of next month at 06:00 local
  next.setDate(1);
  if (next <= from) next.setMonth(next.getMonth() + 1);
  return next.toISOString();
}

export function formatNextPayoutAt(iso: string | null | undefined): string {
  if (!iso) return "On demand when you request a payout";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

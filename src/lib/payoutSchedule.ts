import { supabase } from "./supabase";

export type PayoutSchedule = "instant" | "daily" | "weekly" | "monthly";

export type EntityTable = "guards" | "merchants";

export type EntityPayoutPrefs = {
  id: string;
  schedule: PayoutSchedule;
  nextPayoutAt: string | null;
  minCents: number;
  /** False when DB migration 20260625150000 is not applied (columns missing). */
  schemaComplete: boolean;
};

const PAYOUT_COLS = "id, payout_schedule, next_payout_at, minimum_payout_threshold_cents";

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

/** True when Supabase/Postgres reports missing payout_schedule columns (migration not applied). */
export function isMissingPayoutScheduleSchema(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return (
    msg.includes("payout_schedule") ||
    msg.includes("next_payout_at") ||
    msg.includes("minimum_payout_threshold")
  );
}

export const PAYOUT_SCHEMA_UPDATE_HINT =
  "Apply database update: run `supabase db push` (migration 20260625150000_payout_schedule_preferences.sql), then refresh.";

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

type PayoutRowSlice = {
  id: string;
  payout_schedule?: string;
  next_payout_at?: string | null;
  minimum_payout_threshold_cents?: number;
};

function prefsFromRow(row: PayoutRowSlice, schemaComplete: boolean): EntityPayoutPrefs {
  const sched = row.payout_schedule ?? "";
  return {
    id: row.id,
    schedule: isPayoutSchedule(sched) ? sched : "weekly",
    nextPayoutAt: row.next_payout_at ?? null,
    minCents: row.minimum_payout_threshold_cents ?? 10000,
    schemaComplete,
  };
}

/** Load payout prefs; falls back to id-only select when migration columns are missing. */
export async function fetchEntityPayoutPrefs(
  table: EntityTable,
  userId: string,
): Promise<{ prefs: EntityPayoutPrefs | null; error: string | null }> {
  const { data, error } = await supabase.from(table).select(PAYOUT_COLS).eq("user_id", userId).maybeSingle();
  if (!error && data?.id) {
    return { prefs: prefsFromRow(data as PayoutRowSlice, true), error: null };
  }
  if (error && isMissingPayoutScheduleSchema(error)) {
    const { data: legacy, error: legacyErr } = await supabase.from(table).select("id").eq("user_id", userId).maybeSingle();
    if (legacyErr) return { prefs: null, error: "We could not load payout preferences." };
    if (!legacy?.id) return { prefs: null, error: null };
    return {
      prefs: {
        id: legacy.id as string,
        schedule: "weekly",
        nextPayoutAt: null,
        minCents: 10000,
        schemaComplete: false,
      },
      error: null,
    };
  }
  if (error) return { prefs: null, error: "We could not load payout preferences." };
  return { prefs: null, error: null };
}

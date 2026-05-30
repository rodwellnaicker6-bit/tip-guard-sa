import { useState, type FormEvent } from "react";
import { PAYOUT_REQUEST_TIMEOUT_MS, withOperationTimeout } from "../lib/operationTimeout";
import { supabase } from "../lib/supabase";
import { zarFromCents } from "../lib/money";
import {
  PAYOUT_SCHEDULE_OPTIONS,
  PAYOUT_SCHEMA_UPDATE_HINT,
  computeNextPayoutAt,
  formatNextPayoutAt,
  isMissingPayoutScheduleSchema,
  isPayoutSchedule,
  type PayoutSchedule,
} from "../lib/payoutSchedule";

type EntityTable = "guards" | "merchants";

type Props = {
  table: EntityTable;
  entityId: string;
  schedule: PayoutSchedule;
  nextPayoutAt: string | null;
  minimumPayoutThresholdCents: number;
  availableCents?: number | null;
  pendingCents?: number | null;
  onSaved?: () => void;
  /** Highlights panel at top of dashboard — hard to miss. */
  prominent?: boolean;
  /** DB migration not applied; save will fail until `supabase db push`. */
  schemaUnavailable?: boolean;
};

export function PayoutSchedulePanel({
  table,
  entityId,
  schedule: initialSchedule,
  nextPayoutAt: initialNext,
  minimumPayoutThresholdCents,
  availableCents,
  pendingCents,
  onSaved,
  prominent = false,
  schemaUnavailable = false,
}: Props) {
  const [schedule, setSchedule] = useState<PayoutSchedule>(initialSchedule);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNext, setSavedNext] = useState<string | null>(initialNext);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const nextAt = computeNextPayoutAt(schedule);
    const payload: Record<string, string | null> = {
      payout_schedule: schedule,
      next_payout_at: nextAt,
    };
    if (table === "merchants") payload.updated_at = new Date().toISOString();

    try {
      const { error: uErr } = await withOperationTimeout(
        "payout",
        "save payout schedule",
        supabase.from(table).update(payload).eq("id", entityId),
        PAYOUT_REQUEST_TIMEOUT_MS,
      );
      if (uErr) {
        setError(
          isMissingPayoutScheduleSchema(uErr)
            ? PAYOUT_SCHEMA_UPDATE_HINT
            : uErr.message || "Could not save payout schedule. Try again.",
        );
        return;
      }
      setSavedNext(nextAt);
      setMessage("Payout schedule saved.");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save payout schedule. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const displayNext = formatNextPayoutAt(savedNext ?? initialNext);
  const minZar = zarFromCents(minimumPayoutThresholdCents);

  return (
    <form
      id="payout-preferences"
      className={`scroll-mt-24 space-y-3${prominent ? " rounded-2xl" : ""}`}
      onSubmit={(ev) => void onSave(ev)}
    >
      {schemaUnavailable && (
        <div
          className="rounded-xl border-2 border-amber-500/50 bg-amber-500/15 px-3 py-3 text-sm text-amber-100"
          role="alert"
        >
          <p className="font-bold text-amber-200">Database update required to save</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/90">{PAYOUT_SCHEMA_UPDATE_HINT}</p>
          <p className="mt-2 text-xs text-slate-400">You can still preview options below; defaults apply until migration runs.</p>
        </div>
      )}

      <div>
        <span className="mb-2 inline-block rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
          Payout preferences
        </span>
        <h3 className={`font-bold text-white${prominent ? " text-lg" : " text-base"}`}>Payout schedule</h3>
        <p className="mt-1 text-xs text-slate-500">
          Choose how often accumulated tips are batched for bank transfer. You can still request a manual payout below
          the minimum when funds are available.
        </p>
      </div>

      {(availableCents != null || pendingCents != null) && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {availableCents != null && (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Available</p>
              <p className="font-bold text-amber-300">{zarFromCents(availableCents)}</p>
            </div>
          )}
          {pendingCents != null && (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase text-slate-500">Pending</p>
              <p className="font-bold text-slate-200">{zarFromCents(pendingCents)}</p>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Minimum payout: <span className="font-semibold text-slate-300">{minZar}</span>
        {savedNext || initialNext ? (
          <>
            {" "}
            · Next batch: <span className="font-semibold text-slate-300">{displayNext}</span>
          </>
        ) : (
          <>
            {" "}
            · <span className="font-semibold text-slate-300">{displayNext}</span>
          </>
        )}
      </p>

      <fieldset className="space-y-2">
        <legend className="sr-only">Payout frequency</legend>
        {PAYOUT_SCHEDULE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 ${
              schedule === opt.value ? "border-amber-500/50 bg-amber-500/10" : "border-white/10 bg-black/20"
            }`}
          >
            <input
              type="radio"
              name="payout_schedule"
              className="mt-1"
              checked={schedule === opt.value}
              onChange={() => {
                if (isPayoutSchedule(opt.value)) setSchedule(opt.value);
              }}
            />
            <span>
              <span className="block text-sm font-bold text-white">{opt.label}</span>
              <span className="block text-xs text-slate-500">{opt.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <button className="btn-gold w-full rounded-2xl py-3 font-black" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save payout schedule"}
      </button>

      {error && (
        <div className="rounded-xl border-2 border-red-500/50 bg-red-500/15 px-3 py-3 text-sm text-red-200" role="alert">
          {error}
        </div>
      )}
      {message && <p className="text-sm text-emerald-400">{message}</p>}
    </form>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { DASHBOARD_LOAD_TIMEOUT_MS, RPC_DEFAULT_TIMEOUT_MS, withOperationTimeout } from "../lib/operationTimeout";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import PageLoader from "../components/PageLoader";
import { FetchError } from "../components/FetchError";
import { downloadDataUrl, renderQrPrintCard } from "../lib/qrBranding";
import { sanitizeDisplayName } from "../lib/sanitize";

type QrRow = {
  id: string;
  code_token: string;
  label: string | null;
  qr_type: string | null;
  location_id: string | null;
  guard_id: string | null;
  default_amount_cents: number | null;
  scan_count: number;
  revoked_at: string | null;
  expires_at: string;
};

type LocationOpt = { id: string; name: string };
type GuardOpt = { id: string; display_name: string };

const QR_TYPES = [
  { value: "merchant_permanent", label: "Venue (permanent)" },
  { value: "location_table", label: "Table / location" },
  { value: "guard_staff", label: "Staff guard" },
  { value: "dynamic_amount", label: "Fixed amount QR" },
] as const;

export default function MerchantQr() {
  const { user } = useAuth();
  const toast = useToast();
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [rows, setRows] = useState<QrRow[]>([]);
  const [locations, setLocations] = useState<LocationOpt[]>([]);
  const [guards, setGuards] = useState<GuardOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [newType, setNewType] = useState<(typeof QR_TYPES)[number]["value"]>("location_table");
  const [newLabel, setNewLabel] = useState("");
  const [newLocationId, setNewLocationId] = useState("");
  const [newGuardId, setNewGuardId] = useState("");
  const [newAmountRands, setNewAmountRands] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const watchdog = window.setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setError((prev) => prev ?? "QR hub load timed out. Please try again.");
      }
    }, DASHBOARD_LOAD_TIMEOUT_MS + 1_000);

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await withOperationTimeout(
          "dashboard",
          "merchant qr load",
          async (signal) => {
            const { data: m, error: mErr } = await supabase
              .from("merchants")
              .select("id, business_name")
              .eq("user_id", user.id)
              .abortSignal(signal)
              .maybeSingle();
            if (cancelled) return;
            if (mErr || !m?.id) {
              setError(mErr?.message ?? "No venue profile found.");
              return;
            }
            setMerchantId(m.id);
            setBusinessName(m.business_name ?? "Venue");

            const [qrRes, locRes, guardRes] = await Promise.all([
              supabase
                .from("qr_codes")
                .select(
                  "id, code_token, label, qr_type, location_id, guard_id, default_amount_cents, scan_count, revoked_at, expires_at",
                )
                .eq("merchant_id", m.id)
                .order("created_at", { ascending: false })
                .abortSignal(signal),
              supabase
                .from("merchant_locations")
                .select("id, name")
                .eq("merchant_id", m.id)
                .eq("active", true)
                .order("name")
                .abortSignal(signal),
              supabase
                .from("guards")
                .select("id, display_name")
                .eq("merchant_id", m.id)
                .order("display_name")
                .abortSignal(signal),
            ]);

            if (cancelled) return;
            if (qrRes.error) setError(qrRes.error.message);
            else setRows((qrRes.data as QrRow[]) ?? []);
            setLocations((locRes.data as LocationOpt[]) ?? []);
            setGuards((guardRes.data as GuardOpt[]) ?? []);
          },
          DASHBOARD_LOAD_TIMEOUT_MS,
        );
      } catch {
        if (!cancelled) setError("QR hub load timed out. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
    };
  }, [user, reload]);

  async function createQr() {
    if (!merchantId) return;
    setBusy(true);
    setError(null);
    try {
      const token = `tg_${crypto.randomUUID().replace(/-/g, "")}`;
      const label = newLabel.trim() ? sanitizeDisplayName(newLabel) : "Venue QR";
      const amountCents =
        newType === "dynamic_amount" && newAmountRands.trim()
          ? Math.round(parseFloat(newAmountRands) * 100)
          : null;

      const insert: Record<string, unknown> = {
        code_token: token,
        label,
        qr_type: newType,
        created_by: user?.id ?? null,
      };

      if (newType === "merchant_permanent") {
        insert.merchant_id = merchantId;
        insert.guard_id = null;
      } else if (newType === "guard_staff" || newType === "dynamic_amount") {
        if (!newGuardId) {
          setError("Select a guard for staff or amount QR codes.");
          return;
        }
        insert.merchant_id = merchantId;
        insert.guard_id = newGuardId;
      } else if (newType === "location_table") {
        insert.merchant_id = merchantId;
        insert.guard_id = newGuardId || guards[0]?.id || null;
        if (newLocationId) insert.location_id = newLocationId;
        if (!insert.guard_id && !newLocationId) {
          setError("Add a location or guard first.");
          return;
        }
      }

      if (amountCents != null && amountCents > 0) insert.default_amount_cents = amountCents;

      const { error: insErr } = await withOperationTimeout(
        "rpc",
        "create qr code",
        supabase.from("qr_codes").insert(insert),
        RPC_DEFAULT_TIMEOUT_MS,
      );
      if (insErr) {
        setError(insErr.message);
        return;
      }
      toast.success("QR code created.");
      setNewLabel("");
      setReload((n) => n + 1);
    } catch {
      setError("QR creation timed out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeQr(id: string) {
    setBusy(true);
    try {
      const { error: upErr } = await withOperationTimeout(
        "rpc",
        "revoke qr code",
        supabase.from("qr_codes").update({ revoked_at: new Date().toISOString() }).eq("id", id),
        RPC_DEFAULT_TIMEOUT_MS,
      );
      if (upErr) toast.error(upErr.message);
      else {
        toast.success("QR revoked.");
        setReload((n) => n + 1);
      }
    } catch {
      toast.error("Revoke timed out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerateQr(id: string) {
    setBusy(true);
    try {
      const { data, error: rpcErr } = await withOperationTimeout(
        "rpc",
        "regenerate_qr_code_token",
        (signal) => supabase.rpc("regenerate_qr_code_token", { p_qr_id: id }).abortSignal(signal),
        RPC_DEFAULT_TIMEOUT_MS,
      );
      if (rpcErr) {
        toast.error(rpcErr.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      toast.success(`New token: ${(row as { code_token?: string })?.code_token ?? "created"}`);
      setReload((n) => n + 1);
    } catch {
      toast.error("Regenerate timed out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function printQr(row: QrRow) {
    const base = window.location.origin;
    const amountQ =
      row.qr_type === "dynamic_amount" && row.default_amount_cents
        ? `?amount=${Math.round(row.default_amount_cents / 100)}`
        : "";
    const tipUrl = `${base}/tip/${row.code_token}${amountQ}`;
    const name =
      guards.find((g) => g.id === row.guard_id)?.display_name ??
      locations.find((l) => l.id === row.location_id)?.name ??
      businessName;
    try {
      const card = await renderQrPrintCard({
        tipUrl,
        guardName: name,
        merchantName: businessName,
        subtitle: row.label ?? "Scan to tip · ZAR · TipGuard SA",
      });
      downloadDataUrl(card, `tipguard-qr-${row.code_token.slice(0, 8)}.png`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (loading) return <PageLoader />;

  const active = rows.filter((r) => !r.revoked_at);

  return (
    <div className="shell mx-auto max-w-lg space-y-5 px-5 py-8 pb-24">
      <header>
        <p className="text-xs font-bold uppercase text-slate-500">Merchant</p>
        <h1 className="text-2xl font-black text-white">QR codes</h1>
        <p className="mt-1 text-sm text-slate-400">
          Create, revoke, and regenerate venue QR codes. Dynamic amount codes accept <code className="text-amber-300">?amount=</code> on the tip URL.
        </p>
      </header>

      {error ? <FetchError message={error} onRetry={() => setReload((n) => n + 1)} /> : null}

      <form
        className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void createQr();
        }}
      >
        <p className="text-sm font-bold text-slate-300">New QR</p>
        <select
          className="field tap-target w-full"
          value={newType}
          onChange={(e) => setNewType(e.target.value as (typeof QR_TYPES)[number]["value"])}
        >
          {QR_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          className="field tap-target w-full"
          placeholder="Label (e.g. Main bar)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
        />
        {(newType === "location_table" || newType === "merchant_permanent") && locations.length > 0 ? (
          <select className="field tap-target w-full" value={newLocationId} onChange={(e) => setNewLocationId(e.target.value)}>
            <option value="">Location (optional)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        ) : null}
        {(newType === "guard_staff" || newType === "dynamic_amount" || newType === "location_table") && guards.length > 0 ? (
          <select className="field tap-target w-full" value={newGuardId} onChange={(e) => setNewGuardId(e.target.value)}>
            <option value="">Guard</option>
            {guards.map((g) => (
              <option key={g.id} value={g.id}>
                {g.display_name}
              </option>
            ))}
          </select>
        ) : null}
        {newType === "dynamic_amount" ? (
          <input
            className="field tap-target w-full"
            placeholder="Default amount (ZAR)"
            value={newAmountRands}
            onChange={(e) => setNewAmountRands(e.target.value)}
            inputMode="decimal"
          />
        ) : null}
        <button className="btn-gold tap-target w-full rounded-xl py-3 font-bold" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create QR"}
        </button>
      </form>

      <ul className="space-y-3">
        {active.length === 0 ? (
          <li className="text-sm text-slate-500">No active QR codes yet.</li>
        ) : (
          active.map((r) => (
            <QrListItem key={r.id} row={r} busy={busy} onRevoke={() => void revokeQr(r.id)} onRegen={() => void regenerateQr(r.id)} onPrint={() => void printQr(r)} />
          ))
        )}
      </ul>

      {rows.some((r) => r.revoked_at) ? (
        <p className="text-xs text-slate-600">{rows.filter((r) => r.revoked_at).length} revoked (hidden)</p>
      ) : null}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-amber-400" to="/merchant/locations">
          Locations
        </Link>
        <Link className="text-amber-400" to="/merchant/qr/print">
          Print kit
        </Link>
        <Link className="text-slate-500" to="/merchant">
          Dashboard
        </Link>
      </div>
    </div>
  );
}

function QrListItem({
  row,
  busy,
  onRevoke,
  onRegen,
  onPrint,
}: {
  row: QrRow;
  busy: boolean;
  onRevoke: () => void;
  onRegen: () => void;
  onPrint: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const tipPath = `/tip/${row.code_token}${
    row.qr_type === "dynamic_amount" && row.default_amount_cents
      ? `?amount=${Math.round(row.default_amount_cents / 100)}`
      : ""
  }`;

  useEffect(() => {
    const url = `${window.location.origin}${tipPath}`;
    void QRCode.toDataURL(url, { width: 120, margin: 1 }).then(setPreview);
  }, [tipPath]);

  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex gap-3">
        {preview ? <img src={preview} alt="" className="h-[120px] w-[120px] rounded-lg bg-white p-1" /> : null}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">{row.label ?? "QR"}</p>
          <p className="text-xs text-slate-500">
            {row.qr_type ?? "guard_staff"} · {row.scan_count} scans
          </p>
          <p className="mt-1 truncate font-mono text-[10px] text-amber-200/80">{row.code_token}</p>
          <Link className="mt-1 block truncate text-xs text-amber-400" to={tipPath}>
            Open tip page
          </Link>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border border-white/15 px-3 py-1 text-xs font-bold text-amber-300" disabled={busy} onClick={onPrint}>
          Print card
        </button>
        <button type="button" className="rounded-lg border border-white/15 px-3 py-1 text-xs font-bold text-slate-300" disabled={busy} onClick={onRegen}>
          Regenerate
        </button>
        <button type="button" className="rounded-lg border border-red-500/30 px-3 py-1 text-xs font-bold text-red-300" disabled={busy} onClick={onRevoke}>
          Revoke
        </button>
      </div>
    </li>
  );
}

import { Link } from "react-router-dom";
import { getBusinessContact } from "../lib/businessContact";

export function BusinessContactBlock({ compact = false }: { compact?: boolean }) {
  const c = getBusinessContact();

  return (
    <aside
      className={
        compact
          ? "rounded-lg border border-slate-700/60 bg-slate-900/40 p-4 text-sm text-slate-300"
          : "rounded-xl border border-slate-700/60 bg-slate-900/50 p-5 text-sm text-slate-300"
      }
    >
      <h2 className={compact ? "text-sm font-bold text-white" : "text-base font-bold text-white"}>
        Business contact
      </h2>
      <dl className="mt-3 space-y-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Operator</dt>
          <dd>{c.legalName}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
          <dd>
            <a href={`mailto:${c.supportEmail}`} className="text-amber-300 underline">
              {c.supportEmail}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Phone</dt>
          <dd className="space-y-1">
            <div>
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="text-amber-300 underline">
                {c.phone}
              </a>
            </div>
            <div>
              <a
                href={`tel:${c.phoneMobile.replace(/\s/g, "")}`}
                className="text-amber-300 underline"
              >
                {c.phoneMobile}
              </a>
            </div>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Address</dt>
          <dd>{c.address}</dd>
        </div>
      </dl>
      {!compact && (
        <p className="mt-3 text-xs text-slate-500">
          Refunds &amp; delivery: <Link to="/legal/refunds">refund policy</Link> ·{" "}
          <Link to="/contact">full contact page</Link>
        </p>
      )}
    </aside>
  );
}

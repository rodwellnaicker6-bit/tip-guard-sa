import { Link } from "react-router-dom";
import {
  isProfileComplete,
  profileChecklist,
  profileCompletionPercent,
  type ProfileCompletionFields,
} from "../lib/profileCompletion";
import { GlassPanel } from "./fintech/GlassPanel";

type Props = {
  fields: ProfileCompletionFields;
  settingsHref?: string;
};

/** Dashboard checklist when profile basics are incomplete. */
export function ProfileCompletionCard({ fields, settingsHref = "/settings" }: Props) {
  if (isProfileComplete(fields)) return null;

  const pct = profileCompletionPercent(fields);
  const items = profileChecklist(fields);

  return (
    <GlassPanel className="fx-fade-up" glow="amber">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-300/90">Profile {pct}% complete</p>
        <Link className="text-xs font-bold text-amber-400" to={settingsHref}>
          Finish
        </Link>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-400">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className={item.done ? "text-emerald-400" : "text-slate-600"} aria-hidden>
              {item.done ? "✓" : "○"}
            </span>
            <span className={item.done ? "text-slate-300" : undefined}>{item.label}</span>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
}

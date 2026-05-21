import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "T";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

export default function GuardSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [province, setProvince] = useState("Gauteng");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    setError(null);
    const { error: err } = await supabase.from("guards").insert({
      user_id: user.id,
      display_name: displayName,
      location,
      province,
      avatar_initials: initials(displayName),
      verified: false,
    });
    if (err) {
      setError(err.message);
      return;
    }
    navigate("/guard");
  }

  return (
    <div className="shell stack">
      <h2>Guard profile</h2>
      <p>Tell customers who you are. Verification can be toggled by an admin.</p>
      <form className="stack mt" onSubmit={onSubmit}>
        <input
          className="field"
          placeholder="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
        <input
          className="field"
          placeholder="Work location (mall, street corner, etc.)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />
        <label>
          Province
          <select className="field mt" value={province} onChange={(e) => setProvince(e.target.value)}>
            {[
              "Gauteng",
              "Western Cape",
              "KwaZulu-Natal",
              "Eastern Cape",
              "Free State",
              "Limpopo",
              "Mpumalanga",
              "North West",
              "Northern Cape",
            ].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn-gold" type="submit">
          Save and continue
        </button>
      </form>
    </div>
  );
}

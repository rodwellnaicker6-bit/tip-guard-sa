import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { VerificationStatusBadge } from "../components/VerificationStatusBadge";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? "T";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase();
}

type MerchantOpt = { id: string; business_name: string };

export default function GuardSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [province, setProvince] = useState("Gauteng");
  const [merchantId, setMerchantId] = useState("");
  const [merchants, setMerchants] = useState<MerchantOpt[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("merchants").select("id, business_name").eq("verified", true).limit(50);
      setMerchants((data as MerchantOpt[]) ?? []);
    })();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    setError(null);
    setBusy(true);

    const { data: inserted, error: err } = await supabase
      .from("guards")
      .insert({
        user_id: user.id,
        display_name: displayName,
        location,
        province,
        avatar_initials: initials(displayName),
        verified: false,
        merchant_id: merchantId || null,
      })
      .select("id")
      .maybeSingle();

    if (err || !inserted?.id) {
      setBusy(false);
      setError(err?.message ?? "Could not create guard profile");
      return;
    }

    if (phone.trim()) {
      await supabase.from("profiles").update({ phone: phone.trim() }).eq("id", user.id);
    }

    if (photoFile) {
      const path = `${user.id}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("guard-photos")
        .upload(path, photoFile, { upsert: true, contentType: photoFile.type || "image/jpeg" });
      if (!upErr) {
        await supabase.from("guards").update({ photo_path: path }).eq("id", inserted.id);
      }
    }

    setBusy(false);
    navigate("/guard");
  }

  return (
    <div className="shell stack">
      <h2>Guard profile</h2>
      <p>Tell customers who you are. Link a venue when you work under an operator.</p>
      <VerificationStatusBadge verified={false} entityLabel="Guard verification" />
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
          placeholder="Mobile number (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
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
        {merchants.length > 0 && (
          <label>
            Venue (optional)
            <select className="field mt" value={merchantId} onChange={(e) => setMerchantId(e.target.value)}>
              <option value="">Independent guard</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.business_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="stack">
          <span>Photo (optional)</span>
          <input className="field" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn-gold" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}

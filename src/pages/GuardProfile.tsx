import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/useAuth";
import { VerificationStatusBadge } from "../components/VerificationStatusBadge";

type GuardSelf = {
  id: string;
  display_name: string;
  bio: string | null;
  work_hours: string | null;
  photo_path: string | null;
  verified: boolean;
};

export default function GuardProfile() {
  const { user } = useAuth();
  const [guard, setGuard] = useState<GuardSelf | null>(null);
  const [bio, setBio] = useState("");
  const [workHours, setWorkHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("guards")
        .select("id, display_name, bio, work_hours, photo_path, verified")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      if (!data) {
        setError("No guard profile for this account.");
        return;
      }
      const g = data as GuardSelf;
      setGuard(g);
      setBio(g.bio ?? "");
      setWorkHours(g.work_hours ?? "");

      const { data: kyc } = await supabase
        .from("kyc_cases")
        .select("status")
        .eq("party_type", "guard")
        .eq("party_id", g.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setKycStatus((kyc?.status as string) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!guard?.id) return;
    setError(null);
    setSaved(false);
    const { error: err } = await supabase.from("guards").update({ bio: bio || null, work_hours: workHours || null }).eq("id", guard.id);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
  }

  async function onPhotoChange(file: File | null) {
    if (!file || !user?.id || !guard?.id) return;
    setError(null);
    const path = `${user.id}/avatar.jpg`;
    const { error: upErr } = await supabase.storage.from("guard-photos").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (upErr) {
      setError(upErr.message);
      return;
    }
    const { error: dbErr } = await supabase.from("guards").update({ photo_path: path }).eq("id", guard.id);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setGuard((prev) => (prev ? { ...prev, photo_path: path } : prev));
  }

  const photoPublic =
    guard?.photo_path && user?.id
      ? supabase.storage.from("guard-photos").getPublicUrl(guard.photo_path).data.publicUrl
      : null;

  if (!guard && !error) {
    return (
      <div className="shell">
        <p>Loading…</p>
      </div>
    );
  }

  if (error && !guard) {
    return (
      <div className="shell stack">
        <div className="error">{error}</div>
        <Link to="/guard/setup">Guard setup</Link>
      </div>
    );
  }

  return (
    <div className="shell stack">
      <h2>Profile</h2>
      <p>{guard?.display_name}</p>
      {guard && (
        <VerificationStatusBadge verified={guard.verified} kycStatus={kycStatus} entityLabel="Guard verification" />
      )}
      <p className="text-xs text-slate-500">
        Verification is set by your operator (see docs/KYC_VERIFICATION.md in the repo).
      </p>
      {photoPublic && (
        <img src={photoPublic} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12 }} />
      )}
      <label className="stack">
        <span>Photo (optional)</span>
        <input className="field" type="file" accept="image/*" onChange={(e) => void onPhotoChange(e.target.files?.[0] ?? null)} />
      </label>
      <form className="stack mt" onSubmit={onSubmit}>
        <label className="stack">
          <span>Bio</span>
          <textarea className="field" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short intro for customers" />
        </label>
        <label className="stack">
          <span>Work hours</span>
          <input className="field" value={workHours} onChange={(e) => setWorkHours(e.target.value)} placeholder="e.g. Mon–Sat 8am–6pm" />
        </label>
        {error && <div className="error">{error}</div>}
        {saved && <div className="success">Saved.</div>}
        <button className="btn-gold" type="submit">
          Save
        </button>
      </form>
      <Link to="/guard">Dashboard</Link>
    </div>
  );
}

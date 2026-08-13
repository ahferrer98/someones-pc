import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "../supabaseClient";

function fmt(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Owner-only usage view. The tab that renders this is already hidden from
// everyone else (see App.jsx), and api/admin-stats.js independently checks
// the caller's email server-side, so this component can just assume it's
// allowed to ask and show whatever comes back (or the error if it doesn't).
export function AdminView() {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    setStatus("loading");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/admin-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setUsers(body.users);
      setStatus("ready");
    } catch (e) {
      // No Vercel function exists under `vite dev`, same limitation as
      // card art caching — this only works once deployed.
      setError(e.message);
      setStatus("error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
          Every account that has ever signed in, most recently active first.
        </div>
        <button className="binder-btn small" onClick={load} disabled={status === "loading"}>
          <RefreshCw size={13} /> {status === "loading" ? "Loading…" : "Refresh"}
        </button>
      </div>

      {status === "error" && (
        <div className="binder-card" style={{ padding: 14, display: "flex", gap: 8, color: "var(--danger)", fontSize: 13 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {status === "ready" && users.length === 0 && (
        <div className="binder-empty">No accounts yet.</div>
      )}

      {status === "ready" && users.length > 0 && (
        <div className="binder-card">
          <div className="binder-row" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--muted)" }}>
            <span style={{ flex: 1 }}>EMAIL</span>
            <span style={{ width: 22 }} />
            <span className="binder-mono" style={{ width: 150 }}>LAST SIGN-IN</span>
            <span className="binder-mono" style={{ width: 150 }}>JOINED</span>
            <span className="binder-mono" style={{ width: 70, textAlign: "center" }}>CARDS</span>
            <span className="binder-mono" style={{ width: 60, textAlign: "center" }}>DECKS</span>
            <span className="binder-mono" style={{ width: 60, textAlign: "center" }}>BULK</span>
          </div>
          {users.map((u) => (
            <div key={u.email} className="binder-row">
              <span style={{ flex: 1 }}>{u.email}</span>
              <span
                style={{ width: 22, display: "flex", justifyContent: "center", color: u.confirmed ? "var(--good)" : "var(--muted)" }}
                title={u.confirmed ? "Confirmed" : "Never confirmed / signed in"}
              >
                {u.confirmed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
              </span>
              <span className="row-break" />
              <span className="binder-mono" style={{ width: 150, color: "var(--muted)" }}>{fmt(u.lastSignInAt)}</span>
              <span className="binder-mono" style={{ width: 150, color: "var(--muted)" }}>{fmt(u.createdAt)}</span>
              <span className="binder-mono" style={{ width: 70, textAlign: "center" }}>{u.uniqueCards}</span>
              <span className="binder-mono" style={{ width: 60, textAlign: "center" }}>{u.decks}</span>
              <span className="binder-mono" style={{ width: 60, textAlign: "center" }}>{u.bulkTrays}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

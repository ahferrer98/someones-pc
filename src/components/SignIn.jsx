import { useState } from "react";
import { Mail, Check, AlertTriangle } from "lucide-react";
import { supabase } from "../supabaseClient";

// Magic-link sign in: the user types an email and Supabase mails them a link
// that logs them in. No password is ever entered, stored, or handled here.
export function SignIn() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  async function submit(e) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage(address);
    }
  }

  return (
    <div className="binder-root" style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 80 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div className="binder-eyebrow">physical inventory</div>
        <div className="binder-title" style={{ marginBottom: 10 }}>Someone's PC</div>

        {status === "sent" ? (
          <div className="binder-card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--good)", marginBottom: 8 }}>
              <Check size={17} />
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 19, fontWeight: 700 }}>Check your email</span>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
              A sign-in link is on its way to <span style={{ color: "var(--paper)" }}>{message}</span>. Open it on this
              device and you'll land straight in your collection. The link is single-use and expires shortly.
            </div>
            <button
              className="binder-btn"
              style={{ marginTop: 14 }}
              onClick={() => {
                setStatus("idle");
                setMessage("");
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form className="binder-card" style={{ padding: 18 }} onSubmit={submit}>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              Sign in to reach your decks, bulk trays and collection. New here? Entering your email creates an
              account — no password to pick or remember.
            </div>
            <input
              className="binder-input"
              style={{ width: "100%", marginBottom: 10 }}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              autoFocus
            />
            <button
              className="binder-btn primary"
              type="submit"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={status === "sending" || !email.trim()}
            >
              <Mail size={15} /> {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {status === "error" && (
              <div style={{ display: "flex", gap: 6, marginTop: 10, color: "var(--danger)", fontSize: 12.5 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{message}</span>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

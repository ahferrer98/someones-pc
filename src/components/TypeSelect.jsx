import { useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import { CARD_TYPES, typeInfo } from "../lib/constants";

// A dropdown for card type that keeps each type's color visible everywhere — the closed
// control, the open list, and the checkmark on the current choice — instead of falling
// back to a plain-text native <select> that can't carry per-option color.
export function TypeSelect({ value, onChange, style }) {
  const [open, setOpen] = useState(false);
  const info = typeInfo(value);
  return (
    <div style={{ position: "relative", ...style }}>
      <button
        type="button"
        className="binder-input"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          justifyContent: "space-between",
          color: info.hex,
          borderColor: info.hex,
          cursor: "pointer",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
          <span className="binder-swatch" style={{ background: info.hex }} />
          {info.label}
        </span>
        <ChevronRight size={12} style={{ transform: open ? "rotate(90deg)" : "none", color: "var(--muted)", flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 19 }} onClick={() => setOpen(false)} />
          <div className="binder-card" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 3, overflow: "hidden" }}>
            {CARD_TYPES.map((t) => (
              <div
                key={t.key}
                className="binder-row"
                style={{ cursor: "pointer", padding: "7px 10px", color: t.hex, flexWrap: "nowrap" }}
                onClick={() => {
                  onChange(t.key);
                  setOpen(false);
                }}
              >
                <span className="binder-swatch" style={{ background: t.hex }} />
                <span style={{ flex: 1 }}>{t.label}</span>
                {value === t.key && <Check size={13} />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

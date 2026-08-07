import { useMemo, useState } from "react";
import { norm, isInfiniteEnergy } from "../lib/constants";
import { parseDecklist } from "../lib/parsers";
import { CardThumb } from "../components/CardThumb";

// Where a card is currently placed, for a given collection card id.
function placementsFor(storages, cardId) {
  return storages
    .map((s) => {
      const entry = s.cards.find((c) => c.cardId === cardId);
      return entry ? { name: s.name, type: s.type, color: s.color, qty: entry.qty } : null;
    })
    .filter(Boolean);
}

export function ListBuilderView({ collection, storages, setMeta }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseDecklist(text), [text]);

  // Prints are tracked individually on purpose — a decklist line asking for a
  // specific set/number only counts copies of THAT exact print as owned.
  // If it falls short, other prints of the same card are surfaced separately
  // as swap candidates, never silently substituted in as if they were the
  // same card.
  const results = useMemo(() => {
    return parsed.map((target) => {
      // Judged straight off the pasted line, so a basic energy counts as
      // unlimited even if that exact print isn't in the collection yet.
      const infinite = isInfiniteEnergy(target, setMeta);

      const exactCard = collection.find(
        (c) => norm(c.name) === norm(target.name) && norm(c.set) === norm(target.set) && norm(c.number) === norm(target.number)
      );
      const owned = exactCard ? exactCard.total : 0;
      const locations = exactCard ? placementsFor(storages, exactCard.id) : [];
      const shortage = infinite ? 0 : target.qty - owned;

      const foundAnyPrint = !!exactCard || collection.some((c) => norm(c.name) === norm(target.name));

      const substitutes =
        shortage > 0
          ? collection
              .filter((c) => norm(c.name) === norm(target.name) && (!exactCard || c.id !== exactCard.id) && c.total > 0)
              .map((c) => ({ card: c, owned: c.total, locations: placementsFor(storages, c.id) }))
          : [];

      return { target, card: exactCard || null, locations, owned, shortage, infinite, foundAnyPrint, substitutes };
    });
  }, [parsed, collection, storages, setMeta]);

  const totalNeeded = parsed.reduce((s, c) => s + c.qty, 0);
  const covered = results.filter((r) => r.shortage <= 0 && (r.card || r.infinite)).reduce((s, r) => s + r.target.qty, 0);

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10, maxWidth: 640 }}>
        Paste a 60-card list and it checks against every card you own, wherever it's currently placed —
        deck or bulk tray — and flags anything short or missing. Prints are tracked individually: a line asking
        for a specific set/number only counts copies of that exact print as owned. If you're short on the exact
        print, a different print of the same card you do own is called out separately as a possible swap — never
        substituted in silently. Ordinary basic energy counts as unlimited — no need to log your bulk — but
        art-rare energy (gold/secret prints) and special energies are tracked like any other card.
      </div>

      <textarea
        className="binder-input"
        style={{ width: "100%", minHeight: 130, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, resize: "vertical", marginBottom: 12 }}
        placeholder={"Pokémon: 12\n4 Iono PAF 80\n2 Professor's Research SVI 189\n..."}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {parsed.length > 0 && (
        <>
          <div style={{ marginBottom: 12, fontSize: 13.5 }}>
            <span className="binder-mono" style={{ color: covered === totalNeeded ? "var(--good)" : "var(--warn)" }}>
              {covered} / {totalNeeded}
            </span>{" "}
            cards fully covered across your storages.
          </div>

          <div className="binder-card">
            <div className="binder-row" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--muted)" }}>
              <span style={{ width: 40 }} />
              <span style={{ flex: 1 }}>CARD</span>
              <span style={{ width: 60, textAlign: "center" }}>NEED</span>
              <span style={{ width: 60, textAlign: "center" }}>OWNED</span>
              <span style={{ flex: 1.4 }}>WHERE</span>
              <span style={{ width: 90, textAlign: "right" }}>STATUS</span>
            </div>
            {results.map((r, i) => {
              // "unlimited" outranks "not found": ordinary basic energy is
              // always available whether or not a row for it was ever logged.
              const statusColor = r.infinite ? "var(--muted)" : !r.foundAnyPrint ? "var(--danger)" : r.shortage > 0 ? "var(--warn)" : "var(--good)";
              const statusText = r.infinite ? "unlimited" : !r.foundAnyPrint ? "not found" : r.shortage > 0 ? `short ${r.shortage}` : "covered";
              return (
                <div key={i} className="binder-row">
                  {r.card ? <CardThumb card={r.card} /> : <div style={{ width: 40, height: 56 }} />}
                  <div style={{ flex: 1 }}>
                    <div>{r.target.name}</div>
                    <span className="binder-chip binder-mono" style={{ marginTop: 3, display: "inline-block" }}>
                      {r.target.set || "—"} {r.target.number ? `#${r.target.number}` : ""}
                    </span>
                    {r.substitutes.length > 0 && (
                      <div style={{ fontSize: 11, color: "var(--foil-a)", marginTop: 4 }}>
                        Don't have this print — but {r.substitutes.length === 1 ? "this could swap in" : "these could swap in"}:{" "}
                        {r.substitutes.map((sub, j) => (
                          <span key={j}>
                            {j > 0 && ", "}
                            {sub.owned}× {sub.card.set || "—"} {sub.card.number ? `#${sub.card.number}` : ""}
                            {sub.locations.length > 0 && ` (${sub.locations.map((l) => l.name).join(", ")})`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="binder-mono" style={{ width: 60, textAlign: "center" }}>{r.target.qty}</span>
                  <span className="binder-mono" style={{ width: 60, textAlign: "center" }}>{r.infinite ? "∞" : r.owned}</span>
                  <div style={{ flex: 1.4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {r.locations.length === 0 && <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>}
                    {r.locations.map((loc, j) => (
                      <span key={j} className="binder-chip" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span className="binder-swatch" style={{ background: loc.color }} />
                        {loc.name} ×{loc.qty}
                      </span>
                    ))}
                  </div>
                  <span className="binder-mono" style={{ width: 90, textAlign: "right", color: statusColor }}>{statusText}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {parsed.length === 0 && <div className="binder-empty">Paste a list above to see where each card currently lives.</div>}
    </div>
  );
}

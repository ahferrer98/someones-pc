import { Search, ChevronRight, X } from "lucide-react";
import { STORAGE_TYPES, typeInfo, isInfiniteEnergy } from "../lib/constants";
import { CardThumb } from "../components/CardThumb";

export function LocateView({ query, setQuery, results, selectedCard, setSelectedCardId, storages, assignedByCard, setMeta }) {
  return (
    <div>
      <div style={{ position: "relative", maxWidth: 420, marginBottom: 18 }}>
        <Search size={15} style={{ position: "absolute", left: 11, top: 10, color: "var(--muted)" }} />
        <input
          className="binder-input"
          style={{ width: "100%", paddingLeft: 32 }}
          placeholder="Search by name, set, or number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query.trim() && results.length === 0 && <div className="binder-empty">No card in your collection matches that.</div>}

      {/* Stays visible with a card open, so several results can be compared
          without closing the panel between each one. */}
      {results.length > 0 && (
        <div className="binder-card" style={{ marginBottom: 18 }}>
          {results.map((c) => {
            const active = selectedCard && selectedCard.id === c.id;
            return (
              <div
                key={c.id}
                className="binder-row"
                style={{ cursor: "pointer", background: active ? "var(--ink-800)" : undefined }}
                onClick={() => setSelectedCardId(active ? null : c.id)}
              >
                <CardThumb card={c} />
                <span style={{ flex: 1, color: active ? "var(--foil-a)" : undefined }}>{c.name}</span>
                <span className="binder-chip binder-mono">{c.set || "—"} {c.number ? `#${c.number}` : ""}</span>
                <ChevronRight size={14} color={active ? "var(--foil-a)" : "var(--muted)"} style={{ transform: active ? "rotate(90deg)" : "none" }} />
              </div>
            );
          })}
        </div>
      )}

      {selectedCard && (
        <div className="holo-panel">
          <div className="holo-sweep" />
          <div className="holo-content">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 14 }}>
                <CardThumb card={selectedCard} w={90} h={126} />
                <div>
                  <div className="binder-eyebrow">
                    {selectedCard.set || "no set"} {selectedCard.number ? `· #${selectedCard.number}` : ""} · {typeInfo(selectedCard.cardType).label}
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 30, fontWeight: 700 }}>{selectedCard.name}</div>
                </div>
              </div>
              <button className="binder-icon-btn" onClick={() => setSelectedCardId(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 22, margin: "16px 0" }}>
              <div>
                <div className="binder-mono" style={{ fontSize: 22 }}>{isInfiniteEnergy(selectedCard, setMeta) ? "∞" : selectedCard.total}</div>
                <div className="binder-eyebrow">owned</div>
              </div>
              <div>
                <div className="binder-mono" style={{ fontSize: 22 }}>{assignedByCard[selectedCard.id] || 0}</div>
                <div className="binder-eyebrow">placed</div>
              </div>
              <div>
                <div
                  className="binder-mono"
                  style={{
                    fontSize: 22,
                    color: isInfiniteEnergy(selectedCard, setMeta) ? "var(--muted)" : selectedCard.total - (assignedByCard[selectedCard.id] || 0) < 0 ? "var(--danger)" : "var(--good)",
                  }}
                >
                  {isInfiniteEnergy(selectedCard, setMeta) ? "∞" : selectedCard.total - (assignedByCard[selectedCard.id] || 0)}
                </div>
                <div className="binder-eyebrow">spare</div>
              </div>
            </div>

            <div className="binder-eyebrow" style={{ marginBottom: 6 }}>currently in</div>
            {storages.filter((s) => s.cards.some((c) => c.cardId === selectedCard.id)).length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Not placed in any storage right now — free to use.</div>
            )}
            {storages
              .filter((s) => s.cards.some((c) => c.cardId === selectedCard.id))
              .map((s) => {
                const qty = s.cards.find((c) => c.cardId === selectedCard.id).qty;
                return (
                  <div key={s.id} className="binder-row" style={{ borderBottom: "none", padding: "6px 0" }}>
                    <span className="binder-swatch" style={{ background: s.color }} />
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <span className="binder-chip">{STORAGE_TYPES.find((t) => t.key === s.type)?.label}</span>
                    <span className="binder-chip binder-mono">×{qty}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {!query.trim() && !selectedCard && (
        <div className="binder-empty">Search for a card to see every storage it's currently placed in, and how many spare copies you have.</div>
      )}
    </div>
  );
}

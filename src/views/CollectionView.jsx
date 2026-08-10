import { useMemo, useState } from "react";
import { ClipboardPaste, AlertTriangle, Trash2, Wand2, Eye, EyeOff } from "lucide-react";
import { CARD_TYPES, isInfiniteEnergy } from "../lib/constants";
import { parseImageLines, matchCard } from "../lib/parsers";
import { getCardData } from "../lib/pokemonTcgApi";
import { EditableCardThumb } from "../components/EditableCardThumb";
import { TypeSelect } from "../components/TypeSelect";

export function CollectionView({ collection, assignedByCard, updateCollectionTotal, updateCollectionImage, updateCollectionType, deleteCollectionCard, setMeta }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [bulkImaging, setBulkImaging] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState(null);
  const [showBasicEnergy, setShowBasicEnergy] = useState(false);

  const bulkPreview = useMemo(() => {
    return parseImageLines(bulkText).map((line) => {
      const { card, quality } = matchCard(collection, line);
      return { line, card, quality };
    });
  }, [bulkText, collection]);

  function applyBulkImages() {
    for (const r of bulkPreview) {
      if (r.card) updateCollectionImage(r.card.id, r.line.url);
    }
    setBulkText("");
    setBulkImaging(false);
  }

  // Decklist import defaults every Trainer line to Item, since plain-text exports
  // don't distinguish subtypes. This re-checks anything still sitting at Item
  // against pokemontcg.io, one card at a time (gentle on the API's rate limit),
  // and corrects it in place when a real Supporter/Tool/Stadium subtype is found.
  async function detectTrainerTypes() {
    const candidates = collection.filter((c) => (c.cardType || "pokemon") === "trainer-item" && c.set && c.number);
    setDetecting(true);
    setDetectResult({ checked: 0, total: candidates.length, updated: 0 });
    let updated = 0;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const data = await getCardData(c);
      if (data?.cardType?.startsWith("trainer-") && data.cardType !== "trainer-item") {
        updateCollectionType(c.id, data.cardType);
        updated++;
      }
      setDetectResult({ checked: i + 1, total: candidates.length, updated });
    }
    setDetecting(false);
  }

  if (collection.length === 0) {
    return <div className="binder-empty">Your collection fills in automatically as you log cards into storages — or add owned copies here.</div>;
  }

  // Ordinary basic energy is unlimited and identical copy to copy, so it's pure
  // clutter in a list you scan to find real cards. Tucked behind a toggle by
  // default; art-rare energy prints are countable cards and stay in the list.
  const basicEnergy = collection.filter((c) => isInfiniteEnergy(c, setMeta));
  const listed = showBasicEnergy ? collection : collection.filter((c) => !isInfiniteEnergy(c, setMeta));

  const filtered = listed.filter((c) => typeFilter === "all" || c.cardType === typeFilter || (!c.cardType && typeFilter === "pokemon"));
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10, maxWidth: 640 }}>
        SPARE = OWNED minus copies currently placed in any storage (deck or bulk tray). A negative spare means your
        storages together claim more copies than OWNED says you have. Card art doesn't load automatically — paste
        links below, or click a single thumbnail to set one at a time.
      </div>

      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="binder-btn small" onClick={() => setBulkImaging((v) => !v)}>
          <ClipboardPaste size={13} /> {bulkImaging ? "Cancel bulk import" : "Bulk paste image links"}
        </button>
        <button className="binder-btn small" disabled={detecting} onClick={detectTrainerTypes} title="Re-checks every Trainer card still marked Item against pokemontcg.io and corrects it to Supporter/Tool/Stadium where possible">
          <Wand2 size={13} /> {detecting ? "Detecting…" : "Detect Trainer subtypes"}
        </button>
        {detectResult && (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {detecting
              ? `Checked ${detectResult.checked} / ${detectResult.total}…`
              : detectResult.total === 0
              ? "No Item-typed cards with a set/number to check."
              : `Checked ${detectResult.total} · corrected ${detectResult.updated}.`}
          </span>
        )}
      </div>

      {bulkImaging && (
        <div className="binder-card" style={{ padding: 12, marginBottom: 14, background: "var(--ink-800)" }}>
          <div className="binder-eyebrow" style={{ marginBottom: 6 }}>one card per line: name (optionally + set/number) then the URL</div>
          <textarea
            className="binder-input"
            style={{ width: "100%", minHeight: 100, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, resize: "vertical" }}
            placeholder={"Iono PAF 80 | https://images.example.com/iono.png\nCharmander OBF 26 | https://images.example.com/charmander.png"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          {bulkPreview.length > 0 && (
            <div style={{ margin: "8px 0", fontSize: 12.5 }}>
              <span style={{ color: "var(--good)" }}>{bulkPreview.filter((r) => r.card).length} matched</span>
              {bulkPreview.some((r) => !r.card) && (
                <span style={{ color: "var(--danger)" }}> · {bulkPreview.filter((r) => !r.card).length} not found: {bulkPreview.filter((r) => !r.card).map((r) => r.line.name).join(", ")}</span>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="binder-btn primary" disabled={!bulkPreview.some((r) => r.card)} onClick={applyBulkImages}>
              Apply {bulkPreview.filter((r) => r.card).length || ""} images
            </button>
            <button className="binder-btn" onClick={() => { setBulkImaging(false); setBulkText(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button className={`binder-btn small ${typeFilter === "all" ? "active-filter" : ""}`} onClick={() => setTypeFilter("all")}>
          All ({listed.length})
        </button>
        {CARD_TYPES.map((t) => {
          const count = listed.filter((c) => (c.cardType || "pokemon") === t.key).length;
          if (count === 0) return null;
          const active = typeFilter === t.key;
          return (
            <button
              key={t.key}
              className="binder-btn small"
              style={active ? { borderColor: t.hex, color: t.hex } : undefined}
              onClick={() => setTypeFilter(t.key)}
            >
              <span className="binder-swatch" style={{ background: t.hex }} /> {t.label} ({count})
            </button>
          );
        })}
        {basicEnergy.length > 0 && (
          <button
            className={`binder-btn small ${showBasicEnergy ? "active-filter" : ""}`}
            onClick={() => setShowBasicEnergy((v) => !v)}
            title="Ordinary basic energy is unlimited, so it's hidden by default to keep this list scannable"
          >
            {showBasicEnergy ? <EyeOff size={13} /> : <Eye size={13} />} {showBasicEnergy ? "Hide" : "Show"} basic energy ({basicEnergy.length})
          </button>
        )}
      </div>

      <div className="binder-card" style={{ maxWidth: 1100 }}>
        <div className="binder-row" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 14, color: "var(--muted)" }}>
          <span style={{ width: 40 }} />
          <span style={{ flex: 1 }}>CARD</span>
          <span className="binder-mono" style={{ width: 100 }}>SET / NO.</span>
          <span style={{ width: 130 }}>TYPE</span>
          <span style={{ width: 60, textAlign: "center" }}>OWNED</span>
          <span style={{ width: 60, textAlign: "center" }}>SPARE</span>
          <span style={{ width: 20 }} />
        </div>
        {sorted.map((c) => {
          const assigned = assignedByCard[c.id] || 0;
          const infinite = isInfiniteEnergy(c, setMeta);
          const spare = c.total - assigned;
          return (
            <div key={c.id} className="binder-row">
              <EditableCardThumb card={c} onSave={(url) => updateCollectionImage(c.id, url)} />
              <span style={{ flex: 1 }}>{c.name}</span>
              <span className="binder-chip binder-mono" style={{ width: 100, textAlign: "center" }}>{c.set || "—"} {c.number ? `#${c.number}` : ""}</span>
              <TypeSelect value={c.cardType || "pokemon"} onChange={(v) => updateCollectionType(c.id, v)} style={{ width: 130 }} />
              {infinite ? (
                <span className="binder-mono" style={{ width: 54, textAlign: "center", color: "var(--muted)" }} title="Ordinary basic energy — treated as unlimited. Art-rare (secret) energy prints are tracked normally.">∞</span>
              ) : (
                <input
                  className="binder-input binder-mono"
                  type="number"
                  min={0}
                  value={c.total}
                  onChange={(e) => updateCollectionTotal(c.id, Math.max(0, Number(e.target.value) || 0))}
                  style={{ width: 54, textAlign: "center" }}
                />
              )}
              <span
                className="binder-mono"
                style={{ width: 60, textAlign: "center", color: infinite ? "var(--muted)" : spare < 0 ? "var(--danger)" : spare === 0 ? "var(--muted)" : "var(--good)" }}
              >
                {infinite ? "∞" : (
                  <>
                    {spare < 0 && <AlertTriangle size={12} style={{ verticalAlign: -1, marginRight: 3 }} />}
                    {spare}
                  </>
                )}
              </span>
              <button className="binder-icon-btn" onClick={() => deleteCollectionCard(c.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

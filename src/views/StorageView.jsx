import { useState } from "react";
import {
  Plus, Trash2, X, ChevronRight, ClipboardPaste, Pencil, Check, Grid3x3, List, Minus,
  PackageOpen, Star, Sparkles, Hammer,
} from "lucide-react";
import { ENERGY, STORAGE_TYPES, typeInfo, norm, looksLikeEnergyName } from "../lib/constants";
import { parseDecklist } from "../lib/parsers";
import { getCardData, guessCardTypeByName } from "../lib/pokemonTcgApi";
import { CardThumb } from "../components/CardThumb";
import { TypeSelect } from "../components/TypeSelect";

export function StorageView({
  storages, cardById, openStorage, setOpenStorage, addStorage, updateStorage, deleteStorage, setDefaultBulk,
  addCardToStorage, addCardsToStorage, removeCardFromStorage, updateStorageCardQty, collection,
}) {
  const [filter, setFilter] = useState("all");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(ENERGY[0].hex);
  const [newType, setNewType] = useState("deck");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(ENERGY[0].hex);
  const [editType, setEditType] = useState("deck");

  function startEdit(s) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
    setEditType(s.type);
  }

  function saveEdit() {
    if (editName.trim()) updateStorage(editingId, { name: editName.trim(), color: editColor, type: editType });
    setEditingId(null);
  }

  const visible = storages.filter((s) => filter === "all" || s.type === filter);
  const deckCount = storages.filter((s) => s.type === "deck").length;
  const bulkCount = storages.filter((s) => s.type === "bulk").length;

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10, maxWidth: 640 }}>
        Taking a card out of a deck (or lowering its count) moves it into your default Bulk Tray automatically —
        it's still yours, just not built. Removing from that Bulk Tray itself is final and manual.
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button className={`binder-btn small ${filter === "all" ? "active-filter" : ""}`} onClick={() => setFilter("all")}>
          All ({storages.length})
        </button>
        <button className={`binder-btn small ${filter === "deck" ? "active-filter" : ""}`} onClick={() => setFilter("deck")}>
          Decks ({deckCount})
        </button>
        <button className={`binder-btn small ${filter === "bulk" ? "active-filter" : ""}`} onClick={() => setFilter("bulk")}>
          Bulk trays ({bulkCount})
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        {visible.map((s) => {
          const total = s.cards.reduce((sum, c) => sum + c.qty, 0);
          const isOpen = openStorage === s.id;
          const isEditing = editingId === s.id;
          const preview = s.cards.slice(0, 5).map((c) => cardById(c.cardId)).filter(Boolean);

          if (isEditing) {
            return (
              <div key={s.id} className="binder-card binder-storage-tile" style={{ width: 250, padding: 14, borderTop: `3px solid ${editColor}` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input className="binder-input" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <div style={{ display: "flex", gap: 5 }}>
                    {STORAGE_TYPES.map((t) => (
                      <button
                        key={t.key}
                        className={`binder-btn small ${editType === t.key ? "active-filter" : ""}`}
                        onClick={() => setEditType(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {ENERGY.map((e) => (
                      <button
                        key={e.key}
                        onClick={() => setEditColor(e.hex)}
                        title={e.label}
                        className="binder-swatch"
                        style={{ background: e.hex, border: editColor === e.hex ? "2px solid var(--paper)" : "2px solid transparent", cursor: "pointer" }}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="binder-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={saveEdit}>
                      <Check size={15} /> Save
                    </button>
                    <button className="binder-btn" onClick={() => setEditingId(null)}>
                      <X size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={s.id} className="binder-card binder-storage-tile" style={{ width: 250, padding: 14, borderTop: `3px solid ${s.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700 }}>{s.name}</div>
                    {s.type === "bulk" && <PackageOpen size={14} color="var(--muted)" />}
                    {s.builtFromList && (
                      <span title="Built from List Builder">
                        <Hammer size={13} color="var(--muted)" />
                      </span>
                    )}
                  </div>
                  <div className="binder-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                    {s.type === "deck" ? `${total} / 60` : `${total} cards`} · {STORAGE_TYPES.find((t) => t.key === s.type)?.label}
                    {s.isDefaultBulk && <span style={{ color: "var(--foil-a)" }}> · default</span>}
                    {s.builtFromList && <span style={{ color: "var(--foil-a)" }}> · built from list</span>}
                  </div>
                  {s.type === "bulk" && !s.isDefaultBulk && (
                    <button
                      className="binder-btn small"
                      style={{ marginTop: 6, padding: "2px 7px", fontSize: 11 }}
                      onClick={() => setDefaultBulk(s.id)}
                      title="Cards removed from any deck will land here automatically"
                    >
                      <Star size={11} /> Make default
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="binder-icon-btn" onClick={() => startEdit(s)} title="Rename / recolor / retype">
                    <Pencil size={14} />
                  </button>
                  <button className="binder-icon-btn" onClick={() => deleteStorage(s.id)} title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {preview.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                  {preview.map((c) => (
                    <CardThumb key={c.id} card={c} w={26} h={36} />
                  ))}
                  {s.cards.length > 5 && (
                    <div style={{ display: "flex", alignItems: "center", fontSize: 11, color: "var(--muted)" }}>+{s.cards.length - 5}</div>
                  )}
                </div>
              )}
              <button className="binder-btn" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => setOpenStorage(isOpen ? null : s.id)}>
                {isOpen ? "Close" : "View list"} <ChevronRight size={14} style={{ transform: isOpen ? "rotate(90deg)" : "none" }} />
              </button>
            </div>
          );
        })}

        <div className="binder-card binder-storage-tile" style={{ width: 250, padding: 14 }}>
          {!adding ? (
            <button className="binder-btn ghost" style={{ width: "100%", justifyContent: "center", height: "100%", minHeight: 76 }} onClick={() => setAdding(true)}>
              <Plus size={16} /> New storage
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input className="binder-input" placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <div style={{ display: "flex", gap: 5 }}>
                {STORAGE_TYPES.map((t) => (
                  <button
                    key={t.key}
                    className={`binder-btn small ${newType === t.key ? "active-filter" : ""}`}
                    onClick={() => setNewType(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {ENERGY.map((e) => (
                  <button
                    key={e.key}
                    onClick={() => setNewColor(e.hex)}
                    title={e.label}
                    className="binder-swatch"
                    style={{ background: e.hex, border: newColor === e.hex ? "2px solid var(--paper)" : "2px solid transparent", cursor: "pointer" }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="binder-btn primary"
                  style={{ flex: 1, justifyContent: "center" }}
                  onClick={() => {
                    addStorage(newName, newColor, newType);
                    setNewName("");
                    setAdding(false);
                  }}
                >
                  Create
                </button>
                <button className="binder-btn" onClick={() => setAdding(false)}>
                  <X size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {openStorage && (
        <StorageDetail
          storage={storages.find((s) => s.id === openStorage)}
          cardById={cardById}
          addCardToStorage={addCardToStorage}
          addCardsToStorage={addCardsToStorage}
          removeCardFromStorage={removeCardFromStorage}
          updateStorageCardQty={updateStorageCardQty}
          collection={collection}
        />
      )}

      {visible.length === 0 && !adding && (
        <div className="binder-empty">
          {filter === "all" ? "No storage logged yet. Start with the deck or bulk tray in front of you." : `No ${filter === "deck" ? "decks" : "bulk trays"} yet.`}
        </div>
      )}
    </div>
  );
}

function StorageDetail({ storage, cardById, addCardToStorage, addCardsToStorage, removeCardFromStorage, updateStorageCardQty, collection }) {
  const [name, setName] = useState("");
  const [set, setSet] = useState("");
  const [number, setNumber] = useState("");
  const [qty, setQty] = useState(1);
  const [cardType, setCardType] = useState("pokemon");
  const [typeTouched, setTypeTouched] = useState(false);
  const [suggest, setSuggest] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState([]);
  const [detecting, setDetecting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [viewMode, setViewMode] = useState("grid");

  if (!storage) return null;
  const total = storage.cards.reduce((s, c) => s + c.qty, 0);

  function handleImportChange(v) {
    setImportText(v);
    setPreview(parseDecklist(v));
  }

  // The decklist parser can't tell Item/Supporter/Tool/Stadium apart from plain
  // text, so it defaults every Trainer line to Item. Before adding, look up any
  // Trainer line with a set + number against pokemontcg.io and use its real
  // subtype when the lookup succeeds — anything unresolved keeps the Item
  // default, same as before.
  async function commitImport() {
    setDetecting(true);
    const resolved = await Promise.all(
      preview.map(async (c) => {
        if (c.cardType !== "trainer-item" || !c.set || !c.number) return c;
        const data = await getCardData(c);
        if (data?.cardType?.startsWith("trainer-")) return { ...c, cardType: data.cardType };
        return c;
      })
    );
    setDetecting(false);
    addCardsToStorage(storage.id, resolved);
    setImportText("");
    setPreview([]);
    setImporting(false);
  }

  function onNameChange(v) {
    setName(v);
    // Cheap, free correction for an obvious case (the type still sitting at
    // its untouched Pokémon default): once the user picks a type themselves,
    // this stops overriding it.
    if (!typeTouched && looksLikeEnergyName(v)) setCardType("energy");
    if (v.trim().length < 2) return setSuggest([]);
    setSuggest(collection.filter((c) => norm(c.name).includes(norm(v))).slice(0, 5));
  }

  // Best-effort correction for whatever the free name heuristic can't catch
  // (Trainer subtypes, non-"Energy"-named energy cards) -- only runs while
  // the user hasn't made an explicit type choice, and only ever narrows a
  // still-default guess, never overrides a deliberate one.
  async function resolveTypeBeforeAdd() {
    if (typeTouched) return cardType;
    if (set.trim() && number.trim()) {
      const data = await getCardData({ name, set, number });
      return data?.cardType || cardType;
    }
    const guessed = await guessCardTypeByName(name);
    return guessed || cardType;
  }

  return (
    <div className="binder-card" style={{ padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700 }}>{storage.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="binder-chip">{storage.type === "deck" ? `${total} / 60` : `${total} cards`}</span>
          <button className="binder-btn small" onClick={() => setViewMode((v) => (v === "grid" ? "list" : "grid"))} title="Switch view">
            {viewMode === "grid" ? <List size={14} /> : <Grid3x3 size={14} />} {viewMode === "grid" ? "List" : "Grid"}
          </button>
          <button className="binder-btn small" onClick={() => setImporting((v) => !v)}>
            <ClipboardPaste size={14} /> {importing ? "Cancel import" : "Paste list"}
          </button>
        </div>
      </div>

      {importing && (
        <div className="binder-card" style={{ padding: 12, marginBottom: 14, background: "var(--ink-800)" }}>
          <div className="binder-eyebrow" style={{ marginBottom: 6 }}>paste a PTCGL or Limitless export</div>
          <textarea
            className="binder-input"
            style={{ width: "100%", minHeight: 90, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, resize: "vertical" }}
            placeholder={"4 Iono PAF 80\n2 Professor's Research SVI 189\n3 Charmander OBF 26"}
            value={importText}
            onChange={(e) => handleImportChange(e.target.value)}
          />
          {preview.length > 0 && (
            <div style={{ margin: "8px 0", fontSize: 12.5, color: "var(--muted)" }}>
              Found {preview.length} line{preview.length === 1 ? "" : "s"} · {preview.reduce((s, c) => s + c.qty, 0)} cards · categorized by
              Pokémon / Trainer / Energy section — Trainer subtypes (Item/Supporter/Tool/Stadium) are looked up automatically where a
              set + number is given; anything not found defaults to Item and can be fixed in Collection.
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="binder-btn primary" disabled={preview.length === 0 || detecting} onClick={commitImport}>
              {detecting ? "Detecting card types…" : `Add ${preview.length > 0 ? `${preview.reduce((s, c) => s + c.qty, 0)} cards` : "cards"}`}
            </button>
            <button className="binder-btn" onClick={() => { setImporting(false); setImportText(""); setPreview([]); }} disabled={detecting}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div>
        {storage.cards.length === 0 && <div className="binder-empty">No cards logged here yet.</div>}

        {storage.cards.length > 0 && viewMode === "list" &&
          storage.cards.map((sc) => {
            const card = cardById(sc.cardId);
            if (!card) return null;
            const ti = typeInfo(card.cardType);
            return (
              <div key={sc.cardId} className="binder-row">
                <CardThumb card={card} />
                <span style={{ flex: 1 }}>{card.name}</span>
                <span className="binder-chip" style={{ color: ti.hex, borderColor: ti.hex }}>{ti.label}</span>
                <span className="binder-chip binder-mono">{card.set || "—"} {card.number ? `#${card.number}` : ""}</span>
                <input
                  className="binder-input binder-mono"
                  type="number"
                  min={1}
                  value={sc.qty}
                  onChange={(e) => updateStorageCardQty(storage.id, sc.cardId, Math.max(1, Number(e.target.value) || 1))}
                  style={{ width: 52, textAlign: "center" }}
                />
                <button className="binder-icon-btn" onClick={() => removeCardFromStorage(storage.id, sc.cardId)}>
                  <X size={15} />
                </button>
              </div>
            );
          })}

        {storage.cards.length > 0 && viewMode === "grid" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, padding: "4px 0 8px" }}>
            {storage.cards.map((sc) => {
              const card = cardById(sc.cardId);
              if (!card) return null;
              const ti = typeInfo(card.cardType);
              return (
                <div key={sc.cardId} className="binder-card card-tile">
                  <CardThumb card={card} w={200} h={280} fill />
                  <div className="card-tile-name">{card.name}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    <span className="binder-chip" style={{ color: ti.hex, borderColor: ti.hex }}>{ti.label}</span>
                    <span className="binder-chip binder-mono">{card.set || "—"} {card.number ? `#${card.number}` : ""}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <button className="stepper-btn" onClick={() => updateStorageCardQty(storage.id, sc.cardId, Math.max(1, sc.qty - 1))}>
                        <Minus size={11} />
                      </button>
                      <span className="binder-mono" style={{ width: 16, textAlign: "center", fontSize: 12.5 }}>{sc.qty}</span>
                      <button className="stepper-btn" onClick={() => updateStorageCardQty(storage.id, sc.cardId, sc.qty + 1)}>
                        <Plus size={11} />
                      </button>
                    </div>
                    <button className="binder-icon-btn" onClick={() => removeCardFromStorage(storage.id, sc.cardId)}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 14, position: "relative", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "2 1 160px" }}>
          <input className="binder-input" style={{ width: "100%" }} placeholder="Card name" value={name} onChange={(e) => onNameChange(e.target.value)} />
          {suggest.length > 0 && (
            <div className="binder-card" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, marginTop: 3 }}>
              {suggest.map((s) => (
                <div
                  key={s.id}
                  className="binder-row"
                  style={{ cursor: "pointer", flexWrap: "nowrap" }}
                  onClick={() => {
                    setName(s.name);
                    setSet(s.set);
                    setNumber(s.number);
                    setCardType(s.cardType || "pokemon");
                    setTypeTouched(true);
                    setSuggest([]);
                  }}
                >
                  <span style={{ flex: 1 }}>{s.name}</span>
                  <span className="binder-chip binder-mono">{s.set} #{s.number}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <input className="binder-input" style={{ flex: "1 1 70px" }} placeholder="Set" value={set} onChange={(e) => setSet(e.target.value)} />
        <input className="binder-input" style={{ flex: "1 1 60px" }} placeholder="No." value={number} onChange={(e) => setNumber(e.target.value)} />
        <TypeSelect
          value={cardType}
          onChange={(v) => {
            setCardType(v);
            setTypeTouched(true);
          }}
          style={{ flex: "1 1 130px" }}
        />
        <input
          className="binder-input binder-mono"
          type="number"
          min={1}
          style={{ width: 56 }}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
        />
        <button
          className="binder-btn primary"
          disabled={adding}
          onClick={async () => {
            if (!name.trim()) return;
            setAdding(true);
            const resolvedType = await resolveTypeBeforeAdd();
            addCardToStorage(storage.id, { name, set, number, qty, cardType: resolvedType });
            setName("");
            setSet("");
            setNumber("");
            setQty(1);
            setCardType("pokemon");
            setTypeTouched(false);
            setSuggest([]);
            setAdding(false);
          }}
        >
          <Plus size={15} /> {adding ? "Adding…" : "Add"}
        </button>
        <button
          className="binder-btn"
          title="Use when these are copies you just physically acquired — adds to this storage AND raises your owned total by the same amount"
          onClick={() => {
            if (!name.trim()) return;
            addCardToStorage(storage.id, { name, set, number, qty, cardType }, true);
            setName("");
            setSet("");
            setNumber("");
            setQty(1);
            setCardType("pokemon");
            setSuggest([]);
          }}
        >
          <Sparkles size={15} /> Add new pickup
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
        <b>Add</b> places existing/spare copies here. <b>Add new pickup</b> also raises your owned total — use it
        when you just physically got the card.
      </div>
    </div>
  );
}

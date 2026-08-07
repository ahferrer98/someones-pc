import { useState, useEffect, useMemo } from "react";
import {
  Plus, Search, Trash2, X, Archive, Boxes, MapPin, AlertTriangle, ChevronRight,
  ClipboardPaste, Pencil, Check, Grid3x3, List, Minus, ListChecks, PackageOpen, Star, Sparkles,
} from "lucide-react";

const ENERGY = [
  { key: "fire", label: "Fire", hex: "#ef4444" },
  { key: "water", label: "Water", hex: "#38bdf8" },
  { key: "grass", label: "Grass", hex: "#4ade80" },
  { key: "lightning", label: "Lightning", hex: "#facc15" },
  { key: "psychic", label: "Psychic", hex: "#c084fc" },
  { key: "fighting", label: "Fighting", hex: "#fb923c" },
  { key: "darkness", label: "Darkness", hex: "#94a3b8" },
  { key: "metal", label: "Metal", hex: "#cbd5e1" },
  { key: "fairy", label: "Fairy", hex: "#f472b6" },
  { key: "dragon", label: "Dragon", hex: "#818cf8" },
  { key: "colorless", label: "Colorless", hex: "#e5e7eb" },
];

const CARD_TYPES = [
  { key: "pokemon", label: "Pokémon", group: "pokemon", hex: "#c0c0c0" },
  { key: "trainer-item", label: "Item", group: "trainer", hex: "#3b82f6" },
  { key: "trainer-supporter", label: "Supporter", group: "trainer", hex: "#ef4444" },
  { key: "trainer-tool", label: "Tool", group: "trainer", hex: "#a855f7" },
  { key: "trainer-stadium", label: "Stadium", group: "trainer", hex: "#22c55e" },
  { key: "energy", label: "Energy", group: "energy", hex: "#f8fafc" },
];
const typeInfo = (key) => CARD_TYPES.find((t) => t.key === key) || CARD_TYPES[0];

// A generic energy line — Energy-typed with no specific set/number — is treated as
// unlimited: PTCGL/Limitless exports often just say "Basic {L} Energy" with no print
// attached, since energy is rarely scarce. A specific print (set + number given) is
// still tracked normally.
const isInfiniteEnergy = (card) => card.cardType === "energy" && !card.set && !card.number;

const STORAGE_TYPES = [
  { key: "deck", label: "Deck" },
  { key: "bulk", label: "Bulk Tray" },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const norm = (s) => (s || "").trim().toLowerCase();

// Parses a Pokemon TCG Live / Limitless-style decklist export:
// lines like "4 Iono PAF 80" -> { qty, name, set, number, cardType }
// Section headers ("Pokémon:", "Trainer:", "Energy:") set the category for the lines under them.
function parseDecklist(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const cards = [];
  let section = "pokemon";
  for (const line of lines) {
    const header = line.match(/^(Pok[eé]mon|Trainer|Energy)\s*:/i);
    if (header) {
      const h = header[1].toLowerCase();
      section = h.startsWith("pok") ? "pokemon" : h.startsWith("trainer") ? "trainer-item" : "energy";
      continue;
    }
    if (/^Total\s*Cards?\s*:/i.test(line)) continue;
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const qty = parseInt(m[1], 10);
    const rest = m[2].trim();
    const setNumMatch = rest.match(/^(.*?)\s+([A-Za-z]{2,5}(?:-[A-Za-z]{2,5})?)\s+(\d+[a-zA-Z]?)$/);
    let name, set, number;
    if (setNumMatch) {
      name = setNumMatch[1].trim();
      set = setNumMatch[2].trim().toUpperCase();
      number = setNumMatch[3].trim();
    } else {
      name = rest;
      set = "";
      number = "";
    }
    if (name) cards.push({ name, set, number, qty, cardType: section });
  }
  return cards;
}

// Best-effort match of a target list line against the collection, for the List Builder.
function matchCard(collection, target) {
  const exact = collection.find(
    (c) => norm(c.name) === norm(target.name) && norm(c.set) === norm(target.set) && norm(c.number) === norm(target.number)
  );
  if (exact) return { card: exact, quality: "exact" };
  if (target.number) {
    const sameNum = collection.find((c) => norm(c.name) === norm(target.name) && norm(c.number) === norm(target.number));
    if (sameNum) return { card: sameNum, quality: "diff-set" };
  }
  const nameOnly = collection.find((c) => norm(c.name) === norm(target.name));
  if (nameOnly) return { card: nameOnly, quality: "name-only" };
  return { card: null, quality: "none" };
}

// Parses lines like "Iono PAF 80 | https://..." or "Iono | https://..." for bulk image import.
function parseImageLines(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const urlMatch = line.match(/https?:\/\/\S+/i);
    if (!urlMatch) continue;
    const url = urlMatch[0];
    let descriptor = line.slice(0, urlMatch.index).trim().replace(/[-|:]+$/, "").trim();
    if (!descriptor) continue;
    const setNumMatch = descriptor.match(/^(.*?)\s+([A-Za-z]{2,5}(?:-[A-Za-z]{2,5})?)\s+(\d+[a-zA-Z]?)$/);
    let name, set, number;
    if (setNumMatch) {
      name = setNumMatch[1].trim();
      set = setNumMatch[2].trim().toUpperCase();
      number = setNumMatch[3].trim();
    } else {
      name = descriptor;
      set = "";
      number = "";
    }
    out.push({ name, set, number, url });
  }
  return out;
}

// Card art lookup — matches on the same set/number shorthand used throughout the app,
// via the public pokemontcg.io API's ptcgoCode field (same abbreviations PTCGL exports use).
// A pasted card.imageUrl always wins over the live lookup, since sandboxed fetches often get blocked.
const imageCache = new Map();

function useCardImage(card, skip) {
  const key = card ? `${norm(card.name)}|${norm(card.set)}|${norm(card.number)}` : null;
  const [img, setImg] = useState(key && imageCache.has(key) ? imageCache.get(key) : undefined);

  useEffect(() => {
    if (skip || !card || !key) return;
    if (imageCache.has(key)) {
      setImg(imageCache.get(key));
      return;
    }
    if (!card.set || !card.number) {
      imageCache.set(key, null);
      setImg(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const q = encodeURIComponent(`set.ptcgoCode:${card.set} number:${card.number}`);
        const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=${q}&pageSize=1`);
        if (!res.ok) throw new Error("lookup failed");
        const data = await res.json();
        const images = data?.data?.[0]?.images || null;
        if (!cancelled) {
          imageCache.set(key, images);
          setImg(images);
        }
      } catch (e) {
        if (!cancelled) {
          imageCache.set(key, null);
          setImg(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, skip]);

  return img;
}

function CardThumb({ card, w = 40, h = 56 }) {
  const apiImg = useCardImage(card, !!card.imageUrl);
  const box = {
    width: w,
    height: h,
    borderRadius: 5,
    flexShrink: 0,
    background: "var(--ink-800)",
    border: "1px solid var(--ink-700)",
    objectFit: "cover",
  };
  if (card.imageUrl) {
    return <img src={card.imageUrl} alt={card.name} style={box} loading="lazy" />;
  }
  const img = apiImg;
  if (img === undefined) {
    return <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--muted)" }}>···</div>;
  }
  if (!img) {
    const initials = (card.name || "?")
      .split(" ")
      .map((w2) => w2[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return (
      <div
        style={{
          ...box,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: w > 70 ? 22 : 11,
          color: "var(--muted)",
        }}
      >
        {initials}
      </div>
    );
  }
  return <img src={w > 70 ? img.large : img.small} alt={card.name} style={box} loading="lazy" />;
}

// A dropdown for card type that keeps each type's color visible everywhere — the closed
// control, the open list, and the checkmark on the current choice — instead of falling
// back to a plain-text native <select> that can't carry per-option color.
function TypeSelect({ value, onChange, style }) {
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

function EditableCardThumb({ card, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(card.imageUrl || "");

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 150 }} onClick={(e) => e.stopPropagation()}>
        <input
          className="binder-input"
          style={{ fontSize: 11, padding: "4px 6px" }}
          placeholder="Paste image URL"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          autoFocus
        />
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="binder-btn"
            style={{ padding: "3px 8px", fontSize: 11.5 }}
            onClick={() => {
              onSave(val.trim());
              setEditing(false);
            }}
          >
            Save
          </button>
          <button className="binder-btn" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ cursor: "pointer" }} onClick={() => setEditing(true)} title="Click to paste a direct image URL">
      <CardThumb card={card} />
    </div>
  );
}

const STYLE = `
  .binder-root {
    --ink-950: #0c0e14;
    --ink-900: #14161f;
    --ink-800: #1c1f2c;
    --ink-700: #262a3a;
    --ink-600: #333850;
    --paper: #e9e7e0;
    --muted: #8b8fa3;
    --foil-a: #7dd3fc;
    --foil-b: #f0abfc;
    --foil-c: #fde68a;
    --danger: #f87171;
    --good: #34d399;
    --warn: #fbbf24;
    background: var(--ink-950);
    color: var(--paper);
    font-family: 'Inter', system-ui, sans-serif;
    min-height: 100%;
    padding: 28px 20px 60px;
    background-image:
      radial-gradient(circle at 15% 0%, rgba(125,211,252,0.05), transparent 40%),
      radial-gradient(circle at 85% 15%, rgba(240,171,252,0.04), transparent 40%);
  }
  .binder-root * { box-sizing: border-box; }
  .binder-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .binder-title {
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 700;
    font-size: 40px;
    letter-spacing: 0.01em;
    line-height: 1;
    margin: 4px 0 22px;
    background: linear-gradient(90deg, var(--paper), var(--paper) 70%, var(--foil-a));
    -webkit-background-clip: text;
    background-clip: text;
  }
  .binder-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--ink-700);
    margin-bottom: 24px;
    overflow-x: auto;
  }
  .binder-tab {
    display: flex;
    align-items: center;
    gap: 7px;
    font-family: 'Barlow Condensed', sans-serif;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 9px 14px;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transform: translateY(1px);
    white-space: nowrap;
  }
  .binder-tab.active {
    color: var(--paper);
    border-bottom: 2px solid var(--foil-a);
  }
  .binder-card {
    background: var(--ink-900);
    border: 1px solid var(--ink-700);
    border-radius: 10px;
  }
  .binder-input, .binder-select {
    background: var(--ink-800);
    border: 1px solid var(--ink-600);
    color: var(--paper);
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 13.5px;
    font-family: 'Inter', sans-serif;
    outline: none;
  }
  .binder-input:focus, .binder-select:focus { border-color: var(--foil-a); }
  .binder-input::placeholder { color: var(--muted); }
  .binder-mono { font-family: 'JetBrains Mono', monospace; }
  .binder-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: 'Barlow Condensed', sans-serif;
    font-weight: 600;
    letter-spacing: 0.02em;
    font-size: 15px;
    padding: 7px 13px;
    border-radius: 6px;
    border: 1px solid var(--ink-600);
    background: var(--ink-800);
    color: var(--paper);
    cursor: pointer;
    white-space: nowrap;
  }
  .binder-btn:hover { border-color: var(--foil-a); }
  .binder-btn.primary {
    background: linear-gradient(90deg, var(--foil-a), var(--foil-b));
    color: var(--ink-950);
    border: none;
  }
  .binder-btn.ghost {
    background: none;
    border: 1px dashed var(--ink-600);
  }
  .binder-btn.small { padding: 4px 9px; font-size: 12.5px; }
  .binder-btn.active-filter { border-color: var(--foil-a); color: var(--foil-a); }
  .binder-icon-btn {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    display: flex;
    align-items: center;
  }
  .binder-icon-btn:hover { color: var(--danger); }
  .binder-chip {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--ink-800);
    border: 1px solid var(--ink-600);
    color: var(--muted);
    white-space: nowrap;
  }
  .binder-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-bottom: 1px solid var(--ink-800);
    font-size: 13.5px;
    flex-wrap: wrap;
  }
  .binder-row:last-child { border-bottom: none; }
  .binder-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--muted);
    font-size: 14px;
  }
  .binder-swatch {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .stepper-btn {
    width: 20px; height: 20px; border-radius: 4px; padding: 0;
    border: 1px solid var(--ink-600); background: var(--ink-800); color: var(--paper);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
  }
  .stepper-btn:hover { border-color: var(--foil-a); }
  .card-tile {
    width: 118px; padding: 8px; display: flex; flex-direction: column;
  }
  .card-tile-name {
    font-size: 11.5px; line-height: 1.25; margin-top: 6px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .holo-panel {
    position: relative;
    border-radius: 12px;
    padding: 22px 22px 18px;
    overflow: hidden;
    background: var(--ink-900);
    border: 1px solid var(--ink-700);
  }
  .holo-sweep {
    position: absolute;
    inset: -40%;
    background: conic-gradient(from 0deg, var(--foil-a), var(--foil-b), var(--foil-c), var(--foil-a));
    opacity: 0.12;
    animation: holo-spin 9s linear infinite;
  }
  @keyframes holo-spin { to { transform: rotate(360deg); } }
  .holo-content { position: relative; z-index: 1; }
  @media (prefers-reduced-motion: reduce) {
    .holo-sweep { animation: none; }
  }
  @media (max-width: 640px) {
    .binder-root { padding: 18px 12px 50px; }
    .binder-title { font-size: 30px; margin-bottom: 16px; }
    .binder-tab { font-size: 15px; padding: 8px 10px; }
    .card-tile { width: 96px; }
    .binder-storage-tile { width: 100% !important; }
    .binder-row { font-size: 13px; }
  }
`;

function loadFont() {
  if (document.getElementById("binder-fonts")) return;
  const link = document.createElement("link");
  link.id = "binder-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}

export default function SomeonesPC() {
  const [collection, setCollection] = useState([]);
  const [storages, setStorages] = useState([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("storage");
  const [openStorage, setOpenStorage] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [saveErr, setSaveErr] = useState(false);
  const [trainerName, setTrainerName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    loadFont();
    (async () => {
      try {
        const c = await window.storage.get("binder:collection");
        if (c) setCollection(JSON.parse(c.value));
      } catch (e) {
        // nothing saved yet
      }
      try {
        const s = await window.storage.get("binder:storages");
        if (s) {
          setStorages(JSON.parse(s.value));
        } else {
          // migrate from the earlier deck-only version, if present
          try {
            const legacy = await window.storage.get("binder:decks");
            if (legacy) setStorages(JSON.parse(legacy.value).map((d) => ({ ...d, type: d.type || "deck" })));
          } catch (e2) {
            // no legacy data either
          }
        }
      } catch (e) {
        // nothing saved yet
      }
      try {
        const n = await window.storage.get("binder:trainerName");
        if (n) setTrainerName(n.value);
      } catch (e) {
        // no name set yet
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.storage.set("binder:collection", JSON.stringify(collection)).catch(() => setSaveErr(true));
  }, [collection, ready]);

  useEffect(() => {
    if (!ready) return;
    window.storage.set("binder:storages", JSON.stringify(storages)).catch(() => setSaveErr(true));
  }, [storages, ready]);

  useEffect(() => {
    if (!ready) return;
    window.storage.set("binder:trainerName", trainerName).catch(() => setSaveErr(true));
  }, [trainerName, ready]);

  function commitName() {
    setTrainerName(nameDraft.trim());
    setEditingName(false);
  }

  const assignedByCard = useMemo(() => {
    const map = {};
    for (const s of storages) {
      for (const sc of s.cards) {
        map[sc.cardId] = (map[sc.cardId] || 0) + sc.qty;
      }
    }
    return map;
  }, [storages]);

  function findOrCreateCard({ name, set, number, cardType }) {
    const existing = collection.find(
      (c) => norm(c.name) === norm(name) && norm(c.set) === norm(set) && norm(c.number) === norm(number)
    );
    if (existing) return existing.id;
    const id = uid();
    setCollection((prev) => [
      ...prev,
      { id, name: name.trim(), set: set.trim(), number: number.trim(), total: 0, cardType: cardType || "pokemon" },
    ]);
    return id;
  }

  function addCardToStorage(storageId, { name, set, number, qty, cardType }, registerAsOwned) {
    if (!name.trim() || !qty) return;
    const cardId = findOrCreateCard({ name, set, number, cardType });
    setStorages((prev) =>
      prev.map((s) => {
        if (s.id !== storageId) return s;
        const existing = s.cards.find((c) => c.cardId === cardId);
        const cards = existing
          ? s.cards.map((c) => (c.cardId === cardId ? { ...c, qty: c.qty + qty } : c))
          : [...s.cards, { cardId, qty }];
        return { ...s, cards };
      })
    );
    setCollection((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        if (registerAsOwned) return { ...c, total: c.total + qty };
        if (c.total < 1) return { ...c, total: Math.max(c.total, qty) };
        return c;
      })
    );
  }

  // Removing/reducing a card FROM A DECK doesn't delete it — the physical card still exists,
  // so it moves into the designated default Bulk Tray. Reducing a BULK storage's own count
  // is treated as a real, deliberate removal with no further auto-routing.
  function updateStorageCardQty(storageId, cardId, qty) {
    setStorages((prev) => {
      const source = prev.find((s) => s.id === storageId);
      if (!source) return prev;
      const entry = source.cards.find((c) => c.cardId === cardId);
      if (!entry) return prev;
      const newQty = Math.max(0, qty);
      const delta = entry.qty - newQty; // > 0 means cards are leaving this storage

      let list = prev.map((s) => {
        if (s.id !== storageId) return s;
        const cards =
          newQty <= 0
            ? s.cards.filter((c) => c.cardId !== cardId)
            : s.cards.map((c) => (c.cardId === cardId ? { ...c, qty: newQty } : c));
        return { ...s, cards };
      });

      if (delta > 0 && source.type === "deck") {
        let target = list.find((s) => s.isDefaultBulk);
        if (!target) {
          target = { id: uid(), name: "Bulk Storage", color: "#cbd5e1", type: "bulk", cards: [], isDefaultBulk: true };
          list = [...list, target];
        }
        list = list.map((s) => {
          if (s.id !== target.id) return s;
          const existing = s.cards.find((c) => c.cardId === cardId);
          const cards = existing
            ? s.cards.map((c) => (c.cardId === cardId ? { ...c, qty: c.qty + delta } : c))
            : [...s.cards, { cardId, qty: delta }];
          return { ...s, cards };
        });
      }
      return list;
    });
  }

  function removeCardFromStorage(storageId, cardId) {
    updateStorageCardQty(storageId, cardId, 0);
  }

  function setDefaultBulk(id) {
    setStorages((prev) => prev.map((s) => ({ ...s, isDefaultBulk: s.type === "bulk" && s.id === id })));
  }

  function addStorage(name, color, type) {
    if (!name.trim()) return;
    setStorages((prev) => {
      const isFirstBulk = type === "bulk" && !prev.some((s) => s.type === "bulk");
      return [...prev, { id: uid(), name: name.trim(), color, type, cards: [], isDefaultBulk: isFirstBulk }];
    });
  }

  function updateStorage(id, updates) {
    setStorages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates, isDefaultBulk: updates.type === "bulk" ? s.isDefaultBulk : false } : s))
    );
  }

  function deleteStorage(id) {
    setStorages((prev) => prev.filter((s) => s.id !== id));
    if (openStorage === id) setOpenStorage(null);
  }

  function updateCollectionTotal(cardId, total) {
    setCollection((prev) => prev.map((c) => (c.id === cardId ? { ...c, total } : c)));
  }

  function updateCollectionImage(cardId, url) {
    setCollection((prev) => prev.map((c) => (c.id === cardId ? { ...c, imageUrl: url || undefined } : c)));
  }

  function updateCollectionType(cardId, cardType) {
    setCollection((prev) => prev.map((c) => (c.id === cardId ? { ...c, cardType } : c)));
  }

  function deleteCollectionCard(cardId) {
    setCollection((prev) => prev.filter((c) => c.id !== cardId));
    setStorages((prev) => prev.map((s) => ({ ...s, cards: s.cards.filter((c) => c.cardId !== cardId) })));
    if (selectedCardId === cardId) setSelectedCardId(null);
  }

  const cardById = (id) => collection.find((c) => c.id === id);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = norm(query);
    return collection.filter(
      (c) => norm(c.name).includes(q) || norm(c.set).includes(q) || norm(c.number).includes(q)
    );
  }, [query, collection]);

  const selectedCard = selectedCardId ? cardById(selectedCardId) : null;

  if (!ready) return null;

  return (
    <div className="binder-root">
      <style>{STYLE}</style>

      <div className="binder-eyebrow">
        physical inventory · {storages.filter((s) => s.type === "deck").length} decks ·{" "}
        {storages.filter((s) => s.type === "bulk").length} bulk trays · {collection.length} unique cards
      </div>

      {editingName ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 22px" }}>
          <input
            className="binder-input"
            style={{ fontSize: 22, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, flex: "1 1 240px", maxWidth: 320 }}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="Your name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
          <button className="binder-btn primary" onClick={commitName}>
            <Check size={15} />
          </button>
          <button className="binder-btn" onClick={() => setEditingName(false)}>
            <X size={15} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "4px 0 22px" }}>
          <div className="binder-title" style={{ margin: 0 }}>{trainerName ? `${trainerName}'s PC` : "Someone's PC"}</div>
          <button
            className="binder-icon-btn"
            onClick={() => {
              setNameDraft(trainerName);
              setEditingName(true);
            }}
            title="Rename"
          >
            <Pencil size={16} />
          </button>
        </div>
      )}

      <div className="binder-tabs">
        <button className={`binder-tab ${tab === "storage" ? "active" : ""}`} onClick={() => setTab("storage")}>
          <Archive size={16} /> Storage
        </button>
        <button className={`binder-tab ${tab === "collection" ? "active" : ""}`} onClick={() => setTab("collection")}>
          <Boxes size={16} /> Collection
        </button>
        <button className={`binder-tab ${tab === "locate" ? "active" : ""}`} onClick={() => setTab("locate")}>
          <MapPin size={16} /> Locate a card
        </button>
        <button className={`binder-tab ${tab === "listbuilder" ? "active" : ""}`} onClick={() => setTab("listbuilder")}>
          <ListChecks size={16} /> List Builder
        </button>
      </div>

      {saveErr && (
        <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 14 }}>
          Couldn't save changes — they'll be lost if you leave this artifact.
        </div>
      )}

      {tab === "storage" && (
        <StorageView
          storages={storages}
          cardById={cardById}
          openStorage={openStorage}
          setOpenStorage={setOpenStorage}
          addStorage={addStorage}
          updateStorage={updateStorage}
          deleteStorage={deleteStorage}
          setDefaultBulk={setDefaultBulk}
          addCardToStorage={addCardToStorage}
          removeCardFromStorage={removeCardFromStorage}
          updateStorageCardQty={updateStorageCardQty}
          collection={collection}
        />
      )}

      {tab === "collection" && (
        <CollectionView
          collection={collection}
          assignedByCard={assignedByCard}
          updateCollectionTotal={updateCollectionTotal}
          updateCollectionImage={updateCollectionImage}
          updateCollectionType={updateCollectionType}
          deleteCollectionCard={deleteCollectionCard}
        />
      )}

      {tab === "locate" && (
        <LocateView
          query={query}
          setQuery={setQuery}
          results={searchResults}
          selectedCard={selectedCard}
          setSelectedCardId={setSelectedCardId}
          storages={storages}
          assignedByCard={assignedByCard}
        />
      )}

      {tab === "listbuilder" && <ListBuilderView collection={collection} storages={storages} />}
    </div>
  );
}

function StorageView({
  storages, cardById, openStorage, setOpenStorage, addStorage, updateStorage, deleteStorage, setDefaultBulk,
  addCardToStorage, removeCardFromStorage, updateStorageCardQty, collection,
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
                  </div>
                  <div className="binder-mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                    {s.type === "deck" ? `${total} / 60` : `${total} cards`} · {STORAGE_TYPES.find((t) => t.key === s.type)?.label}
                    {s.isDefaultBulk && <span style={{ color: "var(--foil-a)" }}> · default</span>}
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

function StorageDetail({ storage, cardById, addCardToStorage, removeCardFromStorage, updateStorageCardQty, collection }) {
  const [name, setName] = useState("");
  const [set, setSet] = useState("");
  const [number, setNumber] = useState("");
  const [qty, setQty] = useState(1);
  const [cardType, setCardType] = useState("pokemon");
  const [suggest, setSuggest] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState([]);
  const [viewMode, setViewMode] = useState("grid");

  if (!storage) return null;
  const total = storage.cards.reduce((s, c) => s + c.qty, 0);

  function handleImportChange(v) {
    setImportText(v);
    setPreview(parseDecklist(v));
  }

  function commitImport() {
    for (const c of preview) addCardToStorage(storage.id, c);
    setImportText("");
    setPreview([]);
    setImporting(false);
  }

  function onNameChange(v) {
    setName(v);
    if (v.trim().length < 2) return setSuggest([]);
    setSuggest(collection.filter((c) => norm(c.name).includes(norm(v))).slice(0, 5));
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
              Pokémon / Trainer / Energy section (trainer subtype defaults to Item — fix in Collection if needed)
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="binder-btn primary" disabled={preview.length === 0} onClick={commitImport}>
              Add {preview.length > 0 ? `${preview.reduce((s, c) => s + c.qty, 0)} cards` : "cards"}
            </button>
            <button className="binder-btn" onClick={() => { setImporting(false); setImportText(""); setPreview([]); }}>
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
                  <CardThumb card={card} w={102} h={142} />
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
        <TypeSelect value={cardType} onChange={setCardType} style={{ flex: "1 1 130px" }} />
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
          onClick={() => {
            if (!name.trim()) return;
            addCardToStorage(storage.id, { name, set, number, qty, cardType });
            setName("");
            setSet("");
            setNumber("");
            setQty(1);
            setCardType("pokemon");
            setSuggest([]);
          }}
        >
          <Plus size={15} /> Add
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

function CollectionView({ collection, assignedByCard, updateCollectionTotal, updateCollectionImage, updateCollectionType, deleteCollectionCard }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [bulkImaging, setBulkImaging] = useState(false);
  const [bulkText, setBulkText] = useState("");

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

  if (collection.length === 0) {
    return <div className="binder-empty">Your collection fills in automatically as you log cards into storages — or add owned copies here.</div>;
  }

  const filtered = collection.filter((c) => typeFilter === "all" || c.cardType === typeFilter || (!c.cardType && typeFilter === "pokemon"));
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10, maxWidth: 640 }}>
        SPARE = OWNED minus copies currently placed in any storage (deck or bulk tray). A negative spare means your
        storages together claim more copies than OWNED says you have. Card art doesn't load automatically — paste
        links below, or click a single thumbnail to set one at a time.
      </div>

      <div style={{ marginBottom: 12 }}>
        <button className="binder-btn small" onClick={() => setBulkImaging((v) => !v)}>
          <ClipboardPaste size={13} /> {bulkImaging ? "Cancel bulk import" : "Bulk paste image links"}
        </button>
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

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button className={`binder-btn small ${typeFilter === "all" ? "active-filter" : ""}`} onClick={() => setTypeFilter("all")}>
          All ({collection.length})
        </button>
        {CARD_TYPES.map((t) => {
          const count = collection.filter((c) => (c.cardType || "pokemon") === t.key).length;
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
      </div>

      <div className="binder-card">
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
          const infinite = isInfiniteEnergy(c);
          const spare = c.total - assigned;
          return (
            <div key={c.id} className="binder-row">
              <EditableCardThumb card={c} onSave={(url) => updateCollectionImage(c.id, url)} />
              <span style={{ flex: 1 }}>{c.name}</span>
              <span className="binder-chip binder-mono" style={{ width: 100, textAlign: "center" }}>{c.set || "—"} {c.number ? `#${c.number}` : ""}</span>
              <TypeSelect value={c.cardType || "pokemon"} onChange={(v) => updateCollectionType(c.id, v)} style={{ width: 130 }} />
              {infinite ? (
                <span className="binder-mono" style={{ width: 54, textAlign: "center", color: "var(--muted)" }} title="Generic energy, no specific print — treated as unlimited">∞</span>
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

function LocateView({ query, setQuery, results, selectedCard, setSelectedCardId, storages, assignedByCard }) {
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

      {results.length > 0 && !selectedCard && (
        <div className="binder-card" style={{ marginBottom: 18 }}>
          {results.map((c) => (
            <div key={c.id} className="binder-row" style={{ cursor: "pointer" }} onClick={() => setSelectedCardId(c.id)}>
              <CardThumb card={c} />
              <span style={{ flex: 1 }}>{c.name}</span>
              <span className="binder-chip binder-mono">{c.set || "—"} {c.number ? `#${c.number}` : ""}</span>
              <ChevronRight size={14} color="var(--muted)" />
            </div>
          ))}
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
                <div className="binder-mono" style={{ fontSize: 22 }}>{isInfiniteEnergy(selectedCard) ? "∞" : selectedCard.total}</div>
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
                    color: isInfiniteEnergy(selectedCard) ? "var(--muted)" : selectedCard.total - (assignedByCard[selectedCard.id] || 0) < 0 ? "var(--danger)" : "var(--good)",
                  }}
                >
                  {isInfiniteEnergy(selectedCard) ? "∞" : selectedCard.total - (assignedByCard[selectedCard.id] || 0)}
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

function ListBuilderView({ collection, storages }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseDecklist(text), [text]);

  const results = useMemo(() => {
    return parsed.map((target) => {
      const { card, quality } = matchCard(collection, target);
      let locations = [];
      let owned = 0;
      let infinite = false;
      if (card) {
        infinite = isInfiniteEnergy(card);
        owned = card.total;
        locations = storages
          .map((s) => {
            const entry = s.cards.find((c) => c.cardId === card.id);
            return entry ? { name: s.name, type: s.type, color: s.color, qty: entry.qty } : null;
          })
          .filter(Boolean);
      }
      const shortage = infinite ? 0 : target.qty - owned;
      return { target, card, quality, locations, owned, shortage, infinite };
    });
  }, [parsed, collection, storages]);

  const totalNeeded = parsed.reduce((s, c) => s + c.qty, 0);
  const covered = results.filter((r) => r.shortage <= 0 && r.card).reduce((s, r) => s + r.target.qty, 0);

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10, maxWidth: 640 }}>
        Paste a 60-card list and it checks against every card you own, wherever it's currently placed —
        deck or bulk tray — and flags anything short or missing. Generic energy lines with no set/number (just
        "Basic {"{"}L{"}"} Energy") are treated as unlimited; a specific print (set + number given) is still tracked.
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
              const statusColor = !r.card ? "var(--danger)" : r.infinite ? "var(--muted)" : r.shortage > 0 ? "var(--warn)" : "var(--good)";
              const statusText = !r.card ? "not found" : r.infinite ? "unlimited" : r.shortage > 0 ? `short ${r.shortage}` : "covered";
              return (
                <div key={i} className="binder-row">
                  {r.card ? <CardThumb card={r.card} /> : <div style={{ width: 40, height: 56 }} />}
                  <div style={{ flex: 1 }}>
                    <div>{r.card ? r.card.name : r.target.name}</div>
                    {r.quality === "diff-set" && <div style={{ fontSize: 11, color: "var(--warn)" }}>different print in your collection</div>}
                    {r.quality === "name-only" && <div style={{ fontSize: 11, color: "var(--warn)" }}>only a different set/number matched — check art</div>}
                    <span className="binder-chip binder-mono" style={{ marginTop: 3, display: "inline-block" }}>
                      {r.target.set || "—"} {r.target.number ? `#${r.target.number}` : ""}
                    </span>
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

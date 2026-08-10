import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Boxes, MapPin, ListChecks, Pencil, Check, X, LogOut } from "lucide-react";
import { uid, norm } from "./lib/constants";
import { loadSetMeta } from "./lib/pokemonTcgApi";
import * as db from "./lib/db";
import { supabase, supabaseConfigured } from "./supabaseClient";
import { SignIn } from "./components/SignIn";
import { StorageView } from "./views/StorageView";
import { CollectionView } from "./views/CollectionView";
import { LocateView } from "./views/LocateView";
import { ListBuilderView } from "./views/ListBuilderView";
import "./styles/app.css";

// Every basic energy type, seeded once per new account. No set/number, which is
// what marks them as ordinary unlimited energy rather than a tracked print.
const BASIC_ENERGY_SEED = [
  ["G", "1"], ["R", "2"], ["W", "3"], ["L", "4"],
  ["P", "5"], ["F", "6"], ["D", "7"], ["M", "8"],
];

async function seedBasicEnergy() {
  const cards = BASIC_ENERGY_SEED.map(([symbol, art]) => ({
    id: uid(),
    name: `Basic {${symbol}} Energy`,
    set: "",
    number: "",
    total: 0,
    cardType: "energy",
    imageUrl: `https://images.pokemontcg.io/sve/${art}.png`,
  }));
  await db.insertCards(cards);
  return cards;
}

export default function App() {
  // undefined = still checking for an existing session, null = signed out.
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!supabaseConfigured) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <SignIn />;
  // Remount the whole app per account so no state leaks between sign-ins.
  return <Binder key={session.user.id} session={session} />;
}

function Binder({ session }) {
  const [collection, setCollection] = useState([]);
  const [storages, setStorages] = useState([]);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [retrying, setRetrying] = useState(0);
  const [tab, setTab] = useState("storage");
  const [openStorage, setOpenStorage] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [saveErr, setSaveErr] = useState(false);
  const [trainerName, setTrainerName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  // Set index (code -> ids + printedTotal), used to tell an art-rare print from
  // a base-rarity one. Null until loaded; everything degrades gracefully.
  const [setMeta, setSetMeta] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadSetMeta().then((meta) => {
      if (!cancelled) setSetMeta(meta);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // db.fetchAll() already retries transient failures a few times internally;
  // this is what runs after it truly gives up, and what the error banner's
  // "Try again" button re-invokes by hand.
  const loadData = useCallback(async () => {
    setRetrying((r) => r + 1);
    db.setCurrentUser(session.user.id);
    try {
      const data = await db.fetchAll();
      let cards = data.collection;
      // No settings row means this account has never loaded before — give it
      // the standard basic energy so decklists don't report bulk shortages.
      // Requiring both the collection AND the storage list to be empty keeps
      // this from firing on an account whose rows exist but aren't visible
      // yet, which would seed a duplicate set.
      if (!data.hasSettingsRow) {
        await db.setTrainerName("");
        if (cards.length === 0 && data.storages.length === 0) {
          try {
            cards = await seedBasicEnergy();
          } catch (e) {
            console.error("Could not seed basic energy", e);
          }
        }
      }
      setCollection(cards);
      setStorages(data.storages);
      setTrainerName(data.trainerName);
      setLoadErr(false);
    } catch (e) {
      console.error(e);
      setLoadErr(true);
    } finally {
      setReady(true);
      setRetrying((r) => r - 1);
    }
  }, [session.user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function commitName() {
    const name = nameDraft.trim();
    setTrainerName(name);
    setEditingName(false);
    db.setTrainerName(name).catch(() => setSaveErr(true));
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

  // Returns { id, total } instead of just the id — callers need to know the
  // card's current OWNED total (0 for a brand-new card) to decide whether to
  // bump it, and reading that back out of a setState updater doesn't work:
  // React doesn't run functional updaters synchronously, so a value written
  // inside one isn't visible yet to code immediately after the setState call.
  function findOrCreateCard({ name, set, number, cardType }) {
    const existing = collection.find(
      (c) => norm(c.name) === norm(name) && norm(c.set) === norm(set) && norm(c.number) === norm(number)
    );
    if (existing) return { id: existing.id, total: existing.total };
    const id = uid();
    const newCard = { id, name: name.trim(), set: set.trim(), number: number.trim(), total: 0, cardType: cardType || "pokemon" };
    setCollection((prev) => [...prev, newCard]);
    db.insertCard(newCard).catch(() => setSaveErr(true));
    return { id, total: 0 };
  }

  // How many total copies of a card sit across every storage, given an
  // optional override for one storage's card list (used to compute "after
  // this add" without waiting for setStorages to actually apply).
  function totalPlaced(cardId, overrideStorageId, overrideCards) {
    return storages.reduce((sum, s) => {
      const cards = s.id === overrideStorageId ? overrideCards : s.cards;
      const entry = cards.find((c) => c.cardId === cardId);
      return sum + (entry ? entry.qty : 0);
    }, 0);
  }

  function addCardToStorage(storageId, { name, set, number, qty, cardType }, registerAsOwned) {
    if (!name.trim() || !qty) return;
    const { id: cardId, total: currentTotal } = findOrCreateCard({ name, set, number, cardType });

    const targetStorage = storages.find((s) => s.id === storageId);
    let updatedCards = null;
    if (targetStorage) {
      const existing = targetStorage.cards.find((c) => c.cardId === cardId);
      updatedCards = existing
        ? targetStorage.cards.map((c) => (c.cardId === cardId ? { ...c, qty: c.qty + qty } : c))
        : [...targetStorage.cards, { cardId, qty }];
      setStorages((prev) => prev.map((s) => (s.id === storageId ? { ...s, cards: updatedCards } : s)));
      db.updateStorageRow(storageId, { cards: updatedCards }).catch(() => setSaveErr(true));
    }

    // OWNED should never sit below what's actually placed somewhere (deck or
    // bulk) — raise it to match whenever placing a card pushes it under that
    // floor, not just the first time a card is logged.
    let newTotal = null;
    if (registerAsOwned) newTotal = currentTotal + qty;
    else {
      const placedAfter = totalPlaced(cardId, storageId, updatedCards ?? targetStorage?.cards ?? []);
      if (currentTotal < placedAfter) newTotal = placedAfter;
    }

    if (newTotal !== null) {
      setCollection((prev) => prev.map((c) => (c.id === cardId ? { ...c, total: newTotal } : c)));
      db.updateCard(cardId, { total: newTotal }).catch(() => setSaveErr(true));
    }
  }

  // Bulk version of addCardToStorage for decklist imports. Merges every line into
  // the storage's card list locally and fires a single Supabase write for the
  // whole batch, instead of one write per line — both faster for a 60-card paste
  // and immune to those per-line writes racing each other over the network.
  function addCardsToStorage(storageId, lines) {
    const validLines = lines.filter((l) => l.name?.trim() && l.qty);
    if (!validLines.length) return;

    const resolved = validLines.map((line) => ({ line, ...findOrCreateCard(line) }));

    const storage = storages.find((s) => s.id === storageId);
    if (!storage) return;
    let mergedCards = storage.cards;
    resolved.forEach(({ id: cardId, line }) => {
      const existing = mergedCards.find((c) => c.cardId === cardId);
      mergedCards = existing
        ? mergedCards.map((c) => (c.cardId === cardId ? { ...c, qty: c.qty + line.qty } : c))
        : [...mergedCards, { cardId, qty: line.qty }];
    });
    setStorages((prev) => prev.map((s) => (s.id === storageId ? { ...s, cards: mergedCards } : s)));
    db.updateStorageRow(storageId, { cards: mergedCards }).catch(() => setSaveErr(true));

    // Same floor as addCardToStorage: OWNED is raised to match what's now
    // placed everywhere, for every distinct card this import touched — never
    // lowered, and only written when it actually needs to move.
    const originalTotals = new Map();
    for (const { id, total } of resolved) if (!originalTotals.has(id)) originalTotals.set(id, total);

    originalTotals.forEach((currentTotal, cardId) => {
      const placedAfter = totalPlaced(cardId, storageId, mergedCards);
      if (currentTotal >= placedAfter) return;
      setCollection((prev) => prev.map((c) => (c.id === cardId ? { ...c, total: placedAfter } : c)));
      db.updateCard(cardId, { total: placedAfter }).catch(() => setSaveErr(true));
    });
  }

  // Removing/reducing a card FROM A DECK doesn't delete it — the physical card still exists,
  // so it moves into the designated default Bulk Tray. Reducing a BULK storage's own count
  // is treated as a real, deliberate removal with no further auto-routing.
  function updateStorageCardQty(storageId, cardId, qty) {
    const source = storages.find((s) => s.id === storageId);
    if (!source) return;
    const entry = source.cards.find((c) => c.cardId === cardId);
    if (!entry) return;
    const newQty = Math.max(0, qty);
    const delta = entry.qty - newQty; // > 0 means cards are leaving this storage

    const sourceCards =
      newQty <= 0
        ? source.cards.filter((c) => c.cardId !== cardId)
        : source.cards.map((c) => (c.cardId === cardId ? { ...c, qty: newQty } : c));

    let next = storages.map((s) => (s.id === storageId ? { ...s, cards: sourceCards } : s));
    const dbOps = [db.updateStorageRow(storageId, { cards: sourceCards })];

    if (delta > 0 && source.type === "deck") {
      let target = next.find((s) => s.isDefaultBulk);
      let targetIsNew = false;
      if (!target) {
        target = { id: uid(), name: "Bulk Storage", color: "#cbd5e1", type: "bulk", cards: [], isDefaultBulk: true };
        next = [...next, target];
        targetIsNew = true;
      }
      const existingInTarget = target.cards.find((c) => c.cardId === cardId);
      const targetCards = existingInTarget
        ? target.cards.map((c) => (c.cardId === cardId ? { ...c, qty: c.qty + delta } : c))
        : [...target.cards, { cardId, qty: delta }];
      next = next.map((s) => (s.id === target.id ? { ...s, cards: targetCards } : s));

      dbOps.push(
        targetIsNew
          ? db.insertStorage({ ...target, cards: targetCards })
          : db.updateStorageRow(target.id, { cards: targetCards })
      );
    }

    setStorages(next);
    Promise.all(dbOps).catch(() => setSaveErr(true));
  }

  function removeCardFromStorage(storageId, cardId) {
    updateStorageCardQty(storageId, cardId, 0);
  }

  function setDefaultBulk(id) {
    const prevDefault = storages.find((s) => s.isDefaultBulk);
    setStorages((prev) => prev.map((s) => ({ ...s, isDefaultBulk: s.type === "bulk" && s.id === id })));
    const ops = [db.updateStorageRow(id, { isDefaultBulk: true })];
    if (prevDefault && prevDefault.id !== id) ops.push(db.updateStorageRow(prevDefault.id, { isDefaultBulk: false }));
    Promise.all(ops).catch(() => setSaveErr(true));
  }

  function addStorage(name, color, type) {
    if (!name.trim()) return;
    const isFirstBulk = type === "bulk" && !storages.some((s) => s.type === "bulk");
    const storage = { id: uid(), name: name.trim(), color, type, cards: [], isDefaultBulk: isFirstBulk };
    setStorages((prev) => [...prev, storage]);
    db.insertStorage(storage).catch(() => setSaveErr(true));
  }

  function updateStorage(id, updates) {
    setStorages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates, isDefaultBulk: updates.type === "bulk" ? s.isDefaultBulk : false } : s))
    );
    const patch = { name: updates.name, color: updates.color, type: updates.type };
    if (updates.type !== "bulk") patch.isDefaultBulk = false;
    db.updateStorageRow(id, patch).catch(() => setSaveErr(true));
  }

  function deleteStorage(id) {
    setStorages((prev) => prev.filter((s) => s.id !== id));
    if (openStorage === id) setOpenStorage(null);
    db.deleteStorageRow(id).catch(() => setSaveErr(true));
  }

  function updateCollectionTotal(cardId, total) {
    setCollection((prev) => prev.map((c) => (c.id === cardId ? { ...c, total } : c)));
    db.updateCard(cardId, { total }).catch(() => setSaveErr(true));
  }

  function updateCollectionImage(cardId, url) {
    setCollection((prev) => prev.map((c) => (c.id === cardId ? { ...c, imageUrl: url || undefined } : c)));
    db.updateCard(cardId, { imageUrl: url || null }).catch(() => setSaveErr(true));
  }

  function updateCollectionType(cardId, cardType) {
    setCollection((prev) => prev.map((c) => (c.id === cardId ? { ...c, cardType } : c)));
    db.updateCard(cardId, { cardType }).catch(() => setSaveErr(true));
  }

  function deleteCollectionCard(cardId) {
    const affected = storages.filter((s) => s.cards.some((c) => c.cardId === cardId));
    setCollection((prev) => prev.filter((c) => c.id !== cardId));
    setStorages((prev) => prev.map((s) => ({ ...s, cards: s.cards.filter((c) => c.cardId !== cardId) })));
    if (selectedCardId === cardId) setSelectedCardId(null);

    const ops = [db.deleteCard(cardId)];
    for (const s of affected) {
      ops.push(db.updateStorageRow(s.id, { cards: s.cards.filter((c) => c.cardId !== cardId) }));
    }
    Promise.all(ops).catch(() => setSaveErr(true));
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="binder-eyebrow">
          physical inventory · {storages.filter((s) => s.type === "deck").length} decks ·{" "}
          {storages.filter((s) => s.type === "bulk").length} bulk trays · {collection.length} unique cards
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="binder-eyebrow" style={{ letterSpacing: "0.08em", textTransform: "none" }}>{session.user.email}</span>
          <button className="binder-btn small" onClick={() => supabase.auth.signOut()} title="Sign out">
            <LogOut size={13} /> Sign out
          </button>
        </div>
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
          <Archive size={18} /> Storage
        </button>
        <button className={`binder-tab ${tab === "collection" ? "active" : ""}`} onClick={() => setTab("collection")}>
          <Boxes size={18} /> Collection
        </button>
        <button className={`binder-tab ${tab === "locate" ? "active" : ""}`} onClick={() => setTab("locate")}>
          <MapPin size={18} /> Locate a card
        </button>
        <button className={`binder-tab ${tab === "listbuilder" ? "active" : ""}`} onClick={() => setTab("listbuilder")}>
          <ListChecks size={18} /> List Builder
        </button>
      </div>

      {loadErr && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--danger)", fontSize: 12, marginBottom: 14 }}>
          <span>Couldn't load your data — check your connection and try again.</span>
          <button className="binder-btn small" onClick={loadData} disabled={retrying > 0}>
            {retrying > 0 ? "Retrying…" : "Try again"}
          </button>
        </div>
      )}
      {saveErr && (
        <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 14 }}>
          Couldn't save a recent change to Supabase — check your connection and Supabase project status.
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
          addCardsToStorage={addCardsToStorage}
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
          setMeta={setMeta}
        />
      )}

      {tab === "locate" && (
        <LocateView
          query={query}
          setQuery={(v) => {
            setQuery(v);
            // Editing the search starts a fresh look-up — otherwise the old
            // card's detail panel sits on top of the new results.
            setSelectedCardId(null);
          }}
          results={searchResults}
          selectedCard={selectedCard}
          setSelectedCardId={setSelectedCardId}
          storages={storages}
          assignedByCard={assignedByCard}
          setMeta={setMeta}
        />
      )}

      {tab === "listbuilder" && <ListBuilderView collection={collection} storages={storages} setMeta={setMeta} />}
    </div>
  );
}

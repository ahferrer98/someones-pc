import { useMemo, useState } from "react";
import { Hammer, X, Check } from "lucide-react";
import { norm, isInfiniteEnergy, ENERGY } from "../lib/constants";
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

export function ListBuilderView({ collection, storages, setMeta, buildDeckFromPlan }) {
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

  // ---- Build mode: turn the pasted list into an actual deck, sourced from
  // cards you've already logged. Bulk trays fill automatically since they're
  // your unbuilt pool; pulling from another deck (or swapping in a substitute
  // print) always requires an explicit per-card choice, never happens
  // silently, and OWNED is never touched — this only reallocates copies that
  // already exist somewhere. ----
  const [buildMode, setBuildMode] = useState(false);
  const [allowDeckPulls, setAllowDeckPulls] = useState(false);
  const [resolutions, setResolutions] = useState({}); // { [lineIndex]: [{ storageId, storageName, cardId, isSubstitute, printLabel, qty }] }
  const [deckName, setDeckName] = useState("");
  const [deckColor, setDeckColor] = useState(ENERGY[0].hex);
  const [showNameForm, setShowNameForm] = useState(false);

  const plan = useMemo(() => {
    if (!buildMode) return null;

    // Working copy of what's available everywhere, drained as lines claim
    // copies — so two lines in the same list can never double-claim the
    // same physical card.
    const pool = new Map();
    storages.forEach((s) => {
      const m = new Map();
      s.cards.forEach((c) => m.set(c.cardId, c.qty));
      pool.set(s.id, m);
    });
    const takeFrom = (storageId, cardId, want) => {
      const m = pool.get(storageId);
      const have = m ? m.get(cardId) || 0 : 0;
      const got = Math.min(have, want);
      if (got > 0) m.set(cardId, have - got);
      return got;
    };

    const lines = results.map((r, i) => {
      if (r.infinite) {
        const cardId = r.card?.id || null;
        return {
          index: i,
          infinite: true,
          pulls: cardId ? [{ cardId, storageId: null, qty: r.target.qty, auto: true, isSubstitute: false }] : [],
          shortage: cardId ? 0 : r.target.qty,
          candidates: [],
        };
      }

      let remaining = r.target.qty;
      const pulls = [];

      // Bulk always fills automatically — no decision needed to draw from
      // your own unbuilt pool.
      if (r.card) {
        for (const s of storages) {
          if (remaining <= 0) break;
          if (s.type !== "bulk") continue;
          const got = takeFrom(s.id, r.card.id, remaining);
          if (got > 0) {
            pulls.push({ cardId: r.card.id, storageId: s.id, storageName: s.name, qty: got, auto: true, isSubstitute: false });
            remaining -= got;
          }
        }
      }

      // Whatever the user has explicitly chosen for this line so far.
      const chosen = resolutions[i] || [];
      chosen.forEach((choice, idx) => {
        if (remaining <= 0) return;
        const got = takeFrom(choice.storageId, choice.cardId, Math.min(choice.qty, remaining));
        if (got > 0) {
          pulls.push({
            cardId: choice.cardId, storageId: choice.storageId, storageName: choice.storageName,
            qty: got, auto: false, isSubstitute: choice.isSubstitute, printLabel: choice.printLabel, resolutionIndex: idx,
          });
          remaining -= got;
        }
      });

      // Remaining options, only shown when there's still a real decision to make.
      const candidates = [];
      if (remaining > 0) {
        if (allowDeckPulls && r.card) {
          storages.forEach((s) => {
            if (s.type !== "deck") return;
            const m = pool.get(s.id);
            const have = m ? m.get(r.card.id) || 0 : 0;
            if (have > 0) {
              candidates.push({
                storageId: s.id, storageName: s.name, cardId: r.card.id, isSubstitute: false,
                printLabel: `${r.card.set || "—"} ${r.card.number ? `#${r.card.number}` : ""}`, available: Math.min(have, remaining),
              });
            }
          });
        }
        collection
          .filter((c) => norm(c.name) === norm(r.target.name) && (!r.card || c.id !== r.card.id))
          .forEach((subCard) => {
            storages.forEach((s) => {
              if (s.type === "deck" && !allowDeckPulls) return;
              const m = pool.get(s.id);
              const have = m ? m.get(subCard.id) || 0 : 0;
              if (have > 0) {
                candidates.push({
                  storageId: s.id, storageName: s.name, cardId: subCard.id, isSubstitute: true,
                  printLabel: `${subCard.set || "—"} ${subCard.number ? `#${subCard.number}` : ""}`, available: Math.min(have, remaining),
                });
              }
            });
          });
      }

      return { index: i, infinite: false, pulls, shortage: remaining, candidates };
    });

    const flatPulls = lines.flatMap((l) => l.pulls.map((p) => ({ cardId: p.cardId, storageId: p.storageId, qty: p.qty })));
    return {
      lines,
      flatPulls,
      totalShort: lines.reduce((s, l) => s + l.shortage, 0),
      totalPulled: flatPulls.reduce((s, p) => s + p.qty, 0),
    };
  }, [buildMode, allowDeckPulls, results, resolutions, storages, collection]);

  function choosePull(lineIndex, candidate) {
    setResolutions((prev) => ({
      ...prev,
      [lineIndex]: [
        ...(prev[lineIndex] || []),
        {
          storageId: candidate.storageId, storageName: candidate.storageName, cardId: candidate.cardId,
          isSubstitute: candidate.isSubstitute, printLabel: candidate.printLabel, qty: candidate.available,
        },
      ],
    }));
  }

  function removePull(lineIndex, resolutionIndex) {
    setResolutions((prev) => ({
      ...prev,
      [lineIndex]: (prev[lineIndex] || []).filter((_, i) => i !== resolutionIndex),
    }));
  }

  function startBuild() {
    setBuildMode(true);
    setResolutions({});
    setShowNameForm(false);
  }

  function cancelBuild() {
    setBuildMode(false);
    setResolutions({});
    setShowNameForm(false);
    setDeckName("");
  }

  function createDeck() {
    if (!plan || !deckName.trim()) return;
    buildDeckFromPlan(deckName, deckColor, plan.flatPulls);
    cancelBuild();
  }

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
          <div style={{ marginBottom: 12, fontSize: 13.5, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span>
              <span className="binder-mono" style={{ color: covered === totalNeeded ? "var(--good)" : "var(--warn)" }}>
                {covered} / {totalNeeded}
              </span>{" "}
              cards fully covered across your storages.
            </span>
            {!buildMode ? (
              <button className="binder-btn small" onClick={startBuild}>
                <Hammer size={13} /> Build a deck from this list
              </button>
            ) : (
              <button className="binder-btn small" onClick={cancelBuild}>
                <X size={13} /> Cancel build
              </button>
            )}
          </div>

          {buildMode && (
            <div className="binder-card" style={{ padding: 12, marginBottom: 14, background: "var(--ink-800)" }}>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
                Bulk trays fill in automatically below. Pulling a card from another deck, or swapping in a
                different print, is never automatic — you'll be asked for each one, and nothing moves until you
                create the deck at the bottom.
              </div>
              <button
                className={`binder-btn small ${allowDeckPulls ? "active-filter" : ""}`}
                onClick={() => setAllowDeckPulls((v) => !v)}
              >
                {allowDeckPulls ? <Check size={13} /> : null} Allow pulling from other decks
              </button>
            </div>
          )}

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
              const line = plan?.lines[i];
              return (
                <div key={i} className="binder-row" style={{ flexWrap: "wrap" }}>
                  {r.card ? <CardThumb card={r.card} /> : <div style={{ width: 40, height: 56 }} />}
                  <div style={{ flex: 1 }}>
                    <div>{r.target.name}</div>
                    <span className="binder-chip binder-mono" style={{ marginTop: 3, display: "inline-block" }}>
                      {r.target.set || "—"} {r.target.number ? `#${r.target.number}` : ""}
                    </span>
                    {!buildMode && r.substitutes.length > 0 && (
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

                  {buildMode && line && !line.infinite && (
                    <div style={{ width: "100%", marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--ink-700)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        {line.pulls.map((p, j) => (
                          <span key={j} className="binder-chip" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            {p.qty}× {p.isSubstitute ? `${p.printLabel} (substitute)` : "exact"} from {p.storageName || "unlimited"}
                            {!p.auto && (
                              <X size={11} style={{ cursor: "pointer" }} onClick={() => removePull(i, p.resolutionIndex)} />
                            )}
                          </span>
                        ))}
                        {line.shortage > 0 && (
                          <span className="binder-mono" style={{ fontSize: 11.5, color: "var(--warn)" }}>
                            still short {line.shortage}
                          </span>
                        )}
                      </div>
                      {line.shortage > 0 && line.candidates.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {line.candidates.map((c, j) => (
                            <button key={j} className="binder-btn small" onClick={() => choosePull(i, c)}>
                              Pull {c.available}× {c.isSubstitute ? `${c.printLabel} (substitute)` : "exact print"} from {c.storageName}
                            </button>
                          ))}
                        </div>
                      )}
                      {line.shortage > 0 && line.candidates.length === 0 && (
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                          Not available anywhere eligible — will be left out of the built deck.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {buildMode && plan && (
            <div className="binder-card" style={{ padding: 14, marginTop: 14 }}>
              <div style={{ fontSize: 13.5, marginBottom: 10 }}>
                <span className="binder-mono" style={{ color: plan.totalShort === 0 ? "var(--good)" : "var(--warn)" }}>
                  {plan.totalPulled} / {totalNeeded}
                </span>{" "}
                cards resolved{plan.totalShort > 0 ? ` — ${plan.totalShort} will be left short` : ""}. Nothing moves until you create the deck.
              </div>
              {!showNameForm ? (
                <button className="binder-btn primary" disabled={plan.totalPulled === 0} onClick={() => setShowNameForm(true)}>
                  Review & create deck
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
                  <input className="binder-input" placeholder="Deck name" value={deckName} onChange={(e) => setDeckName(e.target.value)} autoFocus />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {ENERGY.map((e) => (
                      <button
                        key={e.key}
                        onClick={() => setDeckColor(e.hex)}
                        title={e.label}
                        className="binder-swatch"
                        style={{ background: e.hex, border: deckColor === e.hex ? "2px solid var(--paper)" : "2px solid transparent", cursor: "pointer" }}
                      />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="binder-btn primary" style={{ flex: 1, justifyContent: "center" }} disabled={!deckName.trim()} onClick={createDeck}>
                      <Check size={15} /> Create deck
                    </button>
                    <button className="binder-btn" onClick={() => setShowNameForm(false)}>
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {parsed.length === 0 && <div className="binder-empty">Paste a list above to see where each card currently lives.</div>}
    </div>
  );
}

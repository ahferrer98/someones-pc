export const ENERGY = [
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

export const CARD_TYPES = [
  { key: "pokemon", label: "Pokémon", group: "pokemon", hex: "#c0c0c0" },
  { key: "trainer-item", label: "Item", group: "trainer", hex: "#3b82f6" },
  { key: "trainer-supporter", label: "Supporter", group: "trainer", hex: "#ef4444" },
  { key: "trainer-tool", label: "Tool", group: "trainer", hex: "#a855f7" },
  { key: "trainer-stadium", label: "Stadium", group: "trainer", hex: "#22c55e" },
  { key: "energy", label: "Energy", group: "energy", hex: "#f8fafc" },
];

export const typeInfo = (key) => CARD_TYPES.find((t) => t.key === key) || CARD_TYPES[0];

export const isBasicEnergyName = (name) => /^\s*basic\b/i.test(name || "");

// Secret rares only exist in full expansions. Small utility sets — the
// energy-only sets, promo sets, trainer galleries — number their cards past the
// printed total as a matter of course without any of them being chase cards
// (Scarlet & Violet Energies prints 8 but numbers up to 12), so the rule below
// must not apply to them. No real expansion is anywhere near this small.
const MIN_EXPANSION_SIZE = 50;

// True when a print is numbered above its expansion's printed run — i.e. a
// secret / art rare (gold energy, alt art, …) rather than the base printing.
// `setMeta` is the set index built in pokemonTcgApi. Unknown sets return false:
// assuming "base rarity" is the safe default, since it's the common case and it
// avoids inventing shortages for cards the API simply hasn't catalogued yet.
export const isSecretRarePrint = (card, setMeta) => {
  if (!setMeta || !card || !card.set || !card.number) return false;
  const entry = setMeta.get(card.set.toUpperCase().replace(/-TG$/, ""));
  if (!entry || entry.printedTotal < MIN_EXPANSION_SIZE) return false;
  const num = parseInt(String(card.number).replace(/^\D+/, ""), 10);
  if (!Number.isFinite(num)) return false;
  return num > entry.printedTotal;
};

// Ordinary basic energy is unlimited — everyone has a shoebox of it, and making
// the app claim you're "short 8 Darkness Energy" because the bulk was never
// logged is just noise. So a base-rarity basic energy never counts as scarce.
//
// Art-rare basic energy is the opposite: a gold/secret-rare Basic Water is a
// real, countable card worth locating across decks, so those stay tracked like
// anything else. `setMeta` (from pokemonTcgApi's set index) is what tells the
// two apart, via the print's number vs the set's printed run — without it every
// basic energy falls back to unlimited, which is the safe direction to err.
//
// Special energies (Rocky, Jet, Reversal, …) are deck-limited by the rules and
// always tracked, regardless of rarity.
export const isInfiniteEnergy = (card, setMeta) => {
  if (card.cardType !== "energy") return false;
  if (!isBasicEnergyName(card.name)) {
    // A bare energy line with no print at all is generic by definition.
    return !card.set && !card.number;
  }
  return !isSecretRarePrint(card, setMeta);
};

export const STORAGE_TYPES = [
  { key: "deck", label: "Deck" },
  { key: "bulk", label: "Bulk Tray" },
];

export const uid = () => Math.random().toString(36).slice(2, 10);

// Combining diacritical marks, U+0300 through U+036F — built from char codes
// rather than a regex literal containing the raw characters or a \uXXXX
// escape, both of which round-trip unreliably through some editing tools.
const COMBINING_MARKS = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");

// Every match/search in the app compares through this — exact-print lookups,
// the Locate search box, List Builder, decklist import, the image-cache key —
// so folding accents here fixes "Poke Pad" matching "Poké Pad" everywhere at
// once, without ever touching what's actually stored or displayed. NFD
// decomposes an accented letter into the plain letter plus a separate
// combining-mark codepoint, which the replace then strips.
export const norm = (s) =>
  (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "");

import { norm } from "./constants";

// Parses a Pokemon TCG Live / Limitless-style decklist export:
// lines like "4 Iono PAF 80" -> { qty, name, set, number, cardType }
// Section headers ("Pokémon:", "Trainer:", "Energy:") set the category for the lines under them.
export function parseDecklist(text) {
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
export function matchCard(collection, target) {
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
export function parseImageLines(text) {
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

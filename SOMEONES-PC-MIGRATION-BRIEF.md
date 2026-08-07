# Someone's PC — migration brief (Claude artifact → real hosted app)

## Why this migration
The current version runs as a Claude artifact (a single React component, `someones-pc.jsx`,
attached as reference). Artifacts run in a sandboxed iframe that blocks all external image
loading — confirmed by testing three unrelated CDNs (Limitless TCG, eBay, Wikimedia), all
blocked identically. That's a hard platform restriction, not a bug in the code. The fix is to
rebuild this as a normal, independently-hosted web app with no sandbox, so card art can load
from anywhere.

**Everything else about the app should carry over as-is.** This is a re-platforming, not a
redesign — same features, same data model, same visual style. The reference file is the
source of truth for exact behavior; this brief is the map.

## Tech stack to use
- React (Vite is fine — no need for Next.js unless you want SSR/routing later)
- A real database instead of `window.storage` — Supabase is a good default (Postgres +
  simple JS client, generous free tier). Two tables roughly matching the current two
  `window.storage` keys: `collection` (cards) and `storages` (decks/bulk trays), plus a
  `settings` table or single row for the trainer name.
- Deploy target: Vercel or Netlify, connected to a GitHub repo for auto-deploy on push.
- Keep `lucide-react` for icons — same icon set is already used throughout.

## Data model (carry over exactly)
**Collection card:**
`{ id, name, set, number, total, cardType, imageUrl? }`
- `cardType` is one of: `pokemon`, `trainer-item`, `trainer-supporter`, `trainer-tool`,
  `trainer-stadium`, `energy`.
- A card is "infinite energy" when `cardType === "energy"` AND `set` and `number` are both
  empty — treated as unlimited everywhere (owned/spare always show "∞", never flags a
  shortage). A specific print (set + number given) is tracked normally.
- `imageUrl`, if present, always takes priority over any live image lookup.

**Storage (a deck or a bulk tray):**
`{ id, name, color, type: "deck" | "bulk", cards: [{ cardId, qty }], isDefaultBulk? }`
- Exactly one bulk-type storage can have `isDefaultBulk: true` at a time.
- Removing a card from a **deck** (fully, or reducing its qty) does NOT delete it — the
  removed quantity automatically moves into the default bulk tray (auto-creating one named
  "Bulk Storage" if none exists yet). Removing/reducing a card **within** a bulk tray is
  final and manual — no further auto-routing.
- Retyping a storage away from "bulk" clears `isDefaultBulk`.

**Trainer name:** a single string, shown as the app title — `"{name}'s PC"`, or
`"Someone's PC"` if unset. Editable inline via a pencil icon next to the title.

## Card type color coding (must stay exact — used in dropdowns, chips, filters, everywhere)
- Pokémon → silver/grey `#c0c0c0`
- Item → blue `#3b82f6`
- Supporter → red `#ef4444`
- Tool → purple `#a855f7`
- Stadium → green `#22c55e`
- Energy → white `#f8fafc`

These live in one `CARD_TYPES` array in the current code — every consumer (the add-card
dropdown, the Collection type editor, filter chips, deck grid/list chips) reads from it, so
keep that single-source-of-truth pattern.

## Features / tabs (all four must carry over)
1. **Storage** — create/edit/delete decks and bulk trays (name, color, type). Deck tiles
   show a live card-count ("N / 60"), bulk tiles show a plain count. A "Make default" star
   marks which bulk tray auto-receives removed deck cards. Opening a storage shows its cards
   in list or grid view, with a paste-in PTCGL/Limitless decklist importer.
2. **Collection** — every unique card across all storages, with OWNED (editable) and SPARE
   (= OWNED − placed-everywhere, red if negative) columns, filterable by type, with inline
   image-URL setting (single or bulk paste) and inline type editing.
3. **Locate a card** — search by name/set/number, see a "holo reveal" style detail panel
   showing which storage(s) currently hold it and how many spares exist.
4. **List Builder** — paste a 60-card list; it matches each line against the whole
   collection (exact match → same name+different set/number → name-only, in that priority
   order) and reports NEED / OWNED / WHERE (which storages) / STATUS (covered / short N /
   not found), respecting the infinite-energy rule above.

## Decklist import parsing (keep this logic)
PTCGL/Limitless export lines like `4 Iono PAF 80` parse to `{ qty, name, set, number }`.
Section headers (`Pokémon:`, `Trainer:`, `Energy:`) set the category for lines under them
(trainer defaults to "Item" subtype since the plain-text export doesn't distinguish
Item/Supporter/Tool/Stadium — user corrects that manually afterward). `Total Cards:` lines
are skipped.

## Two add-to-deck actions (don't collapse these into one button)
- **Add** — places copies into this storage from existing/spare stock; doesn't touch OWNED
  unless the card is brand new (OWNED was 0).
- **Add new pickup** — same placement, but always raises OWNED by the added quantity. For
  the moment of physically acquiring new cards while deckbuilding.

## Visual identity (keep the same look and feel)
Dark ink background (`#0c0e14` → `#1c1f2c` layers), a cyan/pink/gold "foil" accent trio used
sparingly (search result reveal panel, gradient title), Barlow Condensed for display type,
Inter for body, JetBrains Mono for set/number codes and stats. The signature visual moment is
the "holo reveal" panel in Locate — a slow-spinning conic-gradient sweep behind the selected
card's detail. Keep energy-type colors for deck tagging (the `ENERGY` array — Fire/Water/
Grass/etc.) separate from the card-type colors above; decks pick from the energy palette,
cards use the CARD_TYPES palette.

## What's explicitly OK to change in the rebuild
- Swap all `window.storage` calls for real database reads/writes.
- Restructure the single 1,600-line file into multiple files/components — it was one file
  only because artifacts require that.
- Card images: since there's no more sandbox, wire up real image loading — either a live
  lookup (e.g. the pokemontcg.io API by set/number) or keep the manual/bulk paste-URL system
  as a fallback for anything the API doesn't resolve.

## Reference
The attached `someones-pc.jsx` is the current, working artifact version — read it for exact
UI copy, edge-case handling, and interaction details not fully spelled out above.

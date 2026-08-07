# Someone's PC

A physical Pokémon TCG collection tracker — decks, bulk trays, collection totals, card
locator, and a decklist-vs-collection checker. Originally built as a Claude artifact; this
is the re-platformed version as a normal Vite + React app backed by Supabase, so card art
can load from real image URLs and APIs without an iframe sandbox blocking it.

See [SOMEONES-PC-MIGRATION-BRIEF.md](./SOMEONES-PC-MIGRATION-BRIEF.md) for the full feature
spec and data model this was rebuilt from.

## Stack

- React + Vite
- Supabase (Postgres) for storage — no backend server needed
- `lucide-react` for icons
- Card art: pasted image URLs, with a live [pokemontcg.io](https://pokemontcg.io) lookup as
  a fallback when a card has a set + number but no pasted URL

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is
   plenty for a personal collection).
2. **Run the schema** — open the SQL editor in your Supabase project and run the contents of
   [`supabase/schema.sql`](./supabase/schema.sql). This creates the `collection`,
   `storages`, and `user_settings` tables, each scoped to an account by row-level security.
   *Upgrading a project that predates accounts? Run
   [`supabase/migration-auth.sql`](./supabase/migration-auth.sql) instead — it keeps your data.*
3. **Turn on email sign-in** — in Supabase, Authentication → Providers → Email. Leave
   "Confirm email" on; magic links need it. Then under Authentication → URL Configuration, add
   your site URL(s) to **Redirect URLs** — `http://localhost:5173` for local work, plus your
   deployed URL later. Links sent to an unlisted URL will refuse to sign in.
4. **Copy your API keys** — in your Supabase project, go to Settings → API and copy the
   Project URL and the `anon` public key.
5. **Configure env vars**:
   ```bash
   cp .env.example .env
   ```
   Then fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`. Optionally add
   `VITE_POKEMONTCG_API_KEY` too — see the notes below.
6. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
   Enter your email at the sign-in screen, open the emailed link, and you're in. A brand new
   account gets a starter row for each basic energy type automatically.

## Deploying

Connect the repo to Vercel or Netlify and set the same environment variables in the project
settings there — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_POKEMONTCG_API_KEY`
if you're using one. `.env` is gitignored, so these don't travel with the repo. Build command
`npm run build`, output directory `dist`.

Then add the deployed URL to **Redirect URLs** in Supabase (Authentication → URL
Configuration). Magic links sent from a URL that isn't listed there will fail to sign in.

## Notes

- **Accounts and isolation.** Sign-in is a magic link — no passwords are chosen, stored, or
  handled by the app. Every row in `collection`, `storages`, and `user_settings` carries a
  `user_id`, and row-level security policies (`auth.uid() = user_id`) enforce ownership *in
  the database*, not in the client. That's what makes the public `anon` key safe to ship in
  the frontend bundle: it grants no access on its own, only what the signed-in session allows.
  Anyone can sign up and gets their own private collection.
- A pasted `imageUrl` on a collection card always wins over the live pokemontcg.io lookup.
- **Energy handling.** Ordinary basic energy is treated as unlimited — you'd otherwise have to log
  a shoebox of bulk Darkness Energy just to stop the List Builder claiming you're short. Art-rare
  basic energy (the gold/secret-rare prints) is a real, countable card, so it's tracked normally
  and stays locatable across decks. The two are told apart by print number versus the set's printed
  run: secret rares are numbered above it (Paldea Evolved prints 193 cards, so `PAL 278` is one).
  That test only applies to full expansions — small utility sets number past their printed total
  routinely without any chase cards in them (Scarlet & Violet Energies prints 8 and numbers to 12).
  Sets missing from the API fall back to "ordinary", which is the safe direction — it never invents
  a shortage. Special energies (Rocky, Jet, …) are always tracked, being deck-limited by the rules.
  Ordinary basic energy is hidden behind a toggle in Collection, and `schema.sql` seeds a printless
  row per energy type so a decklist never reports a shortage on bulk energy you haven't logged.
- A free pokemontcg.io API key (https://pokemontcg.io/) can be set as
  `VITE_POKEMONTCG_API_KEY` to raise rate limits. It's optional — see below for the failure
  mode that actually matters.
- Decklist import (and the "Detect Trainer subtypes" button in Collection) look up each
  Trainer card's real subtype — Item / Supporter / Tool / Stadium — against pokemontcg.io.
  Anything the lookup can't resolve (no set/number, or not found) keeps the Item default and
  can be fixed by hand.

### Working around the pokemontcg.io API

The API is functional but unreliable, and `src/lib/pokemonTcgApi.js` compensates for three
distinct quirks found by testing against it directly:

1. **Random 500s.** The identical query alternates between `200` and an empty-bodied `500`,
   sometimes failing the majority of attempts. Requests retry up to 8 times with jittered
   backoff.
2. **`set.ptcgoCode` is unreliable as a card filter.** Set records carry a `ptcgoCode`
   (`PAL`, `SFA`, …), but the *card* index's embedded set object frequently omits it, so
   `set.ptcgoCode:PAL number:248` matches nothing even though the card exists. The set list
   is fetched once to map each PTCGL code to its set id(s), and cards are queried by
   `set.id` instead. Codes mapping to two sets (Trainer Gallery siblings like
   `SIT` → `swsh12` + `swsh12tg`) are OR'd together, and `-TG` suffixed codes get their
   number rewritten (`SIT-TG 25` → set `swsh12tg`, number `TG25`).
3. **Spurious empty results.** The API occasionally answers `200` with zero matches for a
   card it demonstrably has. Because a miss is cached for the session, every miss is
   confirmed with a second pass before being believed.

Successful lookups are mirrored into `localStorage` (card data is immutable once printed),
so after one good pass a collection renders instantly and keeps working even while the API
is throwing errors. Misses are deliberately *not* persisted — a card missing today may be
one the API adds later.

Some sets genuinely aren't in the API at all, and no retry will find them — its data
currently ends at Pitch Black (`PBL`). Mega Evolution-era promo and energy sets (`MEP`,
`MEE`) are absent, so those cards need a manually pasted image URL via the bulk-paste tool
in Collection.

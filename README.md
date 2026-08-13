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
  a fallback when a card has a set + number but no pasted URL. Actual image bytes are cached
  permanently in Supabase Storage the first time each card is displayed (see below) — needs a
  deployment to work, since the caching itself happens in a Vercel function.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier is
   plenty for a personal collection).
2. **Run the schema** — open the SQL editor in your Supabase project and run the contents of
   [`supabase/schema.sql`](./supabase/schema.sql). This creates the `collection`,
   `storages`, and `user_settings` tables, each scoped to an account by row-level security.
   Then run [`supabase/storage-setup.sql`](./supabase/storage-setup.sql) too — it creates the
   `card-art` bucket the image cache writes to (see "Card art caching" below).
   *Upgrading a project that predates accounts? Run
   [`supabase/migration-auth.sql`](./supabase/migration-auth.sql) instead — it keeps your data.*
   *Upgrading a project that predates List Builder's "build a deck" feature? Also run
   [`supabase/migration-list-builder.sql`](./supabase/migration-list-builder.sql) — adds one column,
   keeps your data.*
3. **Turn on email sign-in** — in Supabase, Authentication → Providers → Email. Leave
   "Confirm email" on; magic links need it. Then under Authentication → URL Configuration, add
   your site URL(s) to **Redirect URLs** — `http://localhost:5173` for local work, plus your
   deployed URL later. Links sent to an unlisted URL will refuse to sign in.
   *Sharing the deployed app with more than one or two people? Also set up custom SMTP (next
   step) before you do — without it, sign-in emails silently start failing with "email rate
   limit exceeded" once a handful go out in the same hour.*
   - **Custom SMTP (required for anything beyond solo/dev use)** — Supabase's default email
     sender is capped very low (a handful of emails per hour, shared across every user of the
     project), fine for testing but not for real traffic. Point Auth at your own sender instead:
     in Supabase, Project Settings → Authentication → SMTP Settings, enable "Custom SMTP", and
     fill in a transactional email provider's credentials. [Resend](https://resend.com) is a
     simple option with a free tier — see "Setting up Resend" below for the exact steps.
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

## Setting up Resend for custom SMTP

Needed once more than a couple of people are using the deployed app — see the note under
"Turn on email sign-in" above for why.

1. **Create a Resend account** at [resend.com](https://resend.com) — the free tier (3,000
   emails/month, 100/day) is plenty for this app.
2. **Add and verify a sending domain.** In the Resend dashboard, go to **Domains → Add
   Domain**, enter a domain you control. Resend gives you a handful of DNS records (SPF, DKIM,
   sometimes a tracking CNAME) — add those at your domain registrar/DNS provider. Verification
   is automatic once they propagate, usually a few minutes, occasionally longer. *Don't have a
   spare domain? Resend also supports sending from their own shared domain for testing, but
   plan to move to your own before relying on it — shared-domain sending is more likely to land
   in spam.*
3. **Create an SMTP API key.** In Resend, go to **API Keys → Create API Key**. Name it
   something like "supabase-smtp", leave it at full access (or scope it to "Sending" only if
   offered). Copy the key immediately — Resend only shows it once.
4. **Plug it into Supabase.** In your Supabase project: **Project Settings → Authentication →
   SMTP Settings**, toggle **Enable Custom SMTP**, then fill in:
   - **Sender email** — an address `@` the domain you verified in step 2 (e.g.
     `noreply@yourdomain.com`)
   - **Sender name** — whatever you want shown as the "from" name, e.g. `Someone's PC`
   - **Host** — `smtp.resend.com`
   - **Port** — `465` (SSL) or `587` (STARTTLS) — either works, 465 is Resend's default
   - **Username** — literally the word `resend`
   - **Password** — the API key you copied in step 3
   Save.
5. **Test it.** Sign out of the app (or open an incognito window) and request a sign-in link
   for a real email you can check. It should arrive within a few seconds, sent from the address
   you set as "Sender email" — confirms the whole chain (Resend → Supabase → your inbox) works.

If the test email doesn't arrive: check Resend's dashboard under **Logs** — it shows every send
attempt and the exact rejection reason if one failed, which is almost always an unverified
domain (step 2 not finished propagating yet) or a sender address that doesn't match the
verified domain.

## Notes

- **Accounts and isolation.** Sign-in is a magic link — no passwords are chosen, stored, or
  handled by the app. Every row in `collection`, `storages`, and `user_settings` carries a
  `user_id`, and row-level security policies (`auth.uid() = user_id`) enforce ownership *in
  the database*, not in the client. That's what makes the public `anon` key safe to ship in
  the frontend bundle: it grants no access on its own, only what the signed-in session allows.
  Anyone can sign up and gets their own private collection.
- A pasted `imageUrl` on a collection card always wins over the live pokemontcg.io lookup.
- **Building a deck from List Builder.** Beyond checking a pasted list against your collection,
  List Builder can assemble a real deck from it. Bulk trays fill in automatically since they're
  your unbuilt pool; pulling a card out of another deck, or swapping in a substitute print, always
  requires an explicit per-card choice — nothing moves until you review the plan and click "Create
  deck." This never raises OWNED (it only reallocates cards already logged somewhere), unlike the
  regular paste-import tool on a deck's own page, which can. Decks built this way carry a small
  hammer badge so the two are easy to tell apart.
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

### Card art caching

Every card image — pasted URL or live pokemontcg.io lookup — renders through `/api/card-image`
rather than being loaded directly. That function ([`api/card-image.js`](./api/card-image.js))
checks Supabase Storage for a cached copy; if there isn't one, it downloads the image
server-side, saves it to the `card-art` bucket, and redirects there. Every later request for
that card — from any browser, any device — hits Storage's CDN directly instead of the
original host.

This exists because `images.pokemontcg.io` and TCGplayer's CDN both refuse cross-origin
`fetch()` (confirmed by testing — they load fine in an `<img>` tag, but JavaScript can't read
the bytes to cache them itself), so caching the actual image data has to happen server-side.
The cache key is the card's identity (name/set/number) rather than the source URL, so a live
lookup and a manually pasted URL for the same print share one cached file.

No `service_role` key is involved — the function authenticates with the same anon key the
rest of the app uses. `storage-setup.sql` grants that key insert/update access scoped to only
the `card-art` bucket; it has no bearing on `collection`, `storages`, or `user_settings`.

This only works once deployed — there's no Vercel function under `vite dev`, so
`/api/card-image` doesn't exist locally. Every `<img>` falls back to the original URL on load
failure, which is what local dev does automatically; card art still displays, just without the
caching.

### Admin usage view

An optional "Admin" tab shows every account that's ever signed up — email, last sign-in,
join date, and how much they've logged (unique cards, decks, bulk trays) — for whoever's
running the deployment. Off by default; nobody sees it unless you turn it on.

1. **Set `VITE_ADMIN_EMAIL`** in your deployment's env vars to the exact email of the account
   that should see the tab. Every other signed-in account never sees it at all.
2. **Set `SUPABASE_SERVICE_ROLE_KEY`** too — in Supabase, Settings → API → reveal and copy the
   `service_role` key. Unlike every other key this app uses, this one bypasses row-level
   security entirely, which is what lets the admin view see every account's rows instead of
   just the signed-in one's. **Never** put it in a `VITE_`-prefixed variable — that would ship
   it straight into the browser bundle for anyone to read. It's only read by
   [`api/admin-stats.js`](./api/admin-stats.js), a server-side function, and only once deployed
   (no Vercel function exists under `vite dev`, same as card art caching above).
3. Redeploy so the new env vars take effect. Sign in as the admin account and the tab appears.

The server independently re-checks the caller's email against `VITE_ADMIN_EMAIL` on every
request using their real session token — the hidden tab is just so other users don't see it
exists, not what actually keeps the data private.

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

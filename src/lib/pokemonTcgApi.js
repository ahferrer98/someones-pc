import { norm } from "./constants";

// Shared pokemontcg.io lookup, used both for card art (useCardImage) and for
// resolving a Trainer card's real subtype (Item/Supporter/Tool/Stadium) during
// decklist import and collection cleanup — one cache, one set of in-flight
// requests, regardless of which feature asked first.

const pending = new Map();
const resolved = new Map();

export function cardCacheKey(card) {
  return `${norm(card.name)}|${norm(card.set)}|${norm(card.number)}`;
}

// Card data never changes once printed, and the API is unreliable enough that
// re-resolving the same cards on every visit is a real cost — so successful
// lookups are mirrored into localStorage and reloaded on startup. After the
// first good pass over a collection, art keeps rendering even while the API is
// throwing 500s. Only positive hits are persisted: a "no such card" answer may
// just mean the set hasn't been added to the API yet, and should be re-checked
// on a later visit.
const CACHE_KEY = "someones-pc:cardCache:v1";

function loadPersistedCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    for (const [key, value] of Object.entries(JSON.parse(raw))) {
      if (value) resolved.set(key, value);
    }
  } catch (e) {
    // corrupt or unavailable storage — start cold, not a failure worth surfacing
  }
}
loadPersistedCache();

let persistQueued = false;
function persistCache() {
  if (persistQueued) return;
  persistQueued = true;
  setTimeout(() => {
    persistQueued = false;
    try {
      const out = {};
      for (const [key, value] of resolved) if (value) out[key] = value;
      localStorage.setItem(CACHE_KEY, JSON.stringify(out));
    } catch (e) {
      // quota exceeded or storage disabled — in-memory cache still works
    }
  }, 500);
}

// Maps the API's supertype/subtypes onto this app's cardType keys. Only
// meaningful for Trainer cards — Pokémon/Energy lines are already categorized
// reliably by decklist section headers, so callers only act on the "trainer-*"
// results.
export function cardTypeFromApiCard(apiCard) {
  const supertype = apiCard.supertype || "";
  const subtypes = apiCard.subtypes || [];
  if (supertype === "Energy") return "energy";
  if (supertype.startsWith("Pok")) return "pokemon";
  if (supertype === "Trainer") {
    if (subtypes.includes("Supporter")) return "trainer-supporter";
    if (subtypes.includes("Stadium")) return "trainer-stadium";
    if (subtypes.some((s) => /tool/i.test(s))) return "trainer-tool";
    return "trainer-item";
  }
  return null;
}

// The public pokemontcg.io API is heavily rate-limited without a key (a
// collection of even a few dozen unique cards can exhaust it on a single page
// load). A free key at https://pokemontcg.io/ raises that limit substantially —
// set VITE_POKEMONTCG_API_KEY in .env to use one.
const API_KEY = import.meta.env.VITE_POKEMONTCG_API_KEY;
const HEADERS = API_KEY ? { "X-Api-Key": API_KEY } : undefined;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The API returns intermittent 500s with an empty body — often the majority of
// requests, unpredictably, with no pattern tied to the query itself (the exact
// same query alternates between 200 and 500 seconds apart). Retry generously
// with jittered backoff rather than reporting the card as having no art.
const MAX_ATTEMPTS = 8;
const backoffMs = (attempt) => Math.min(250 * 2 ** (attempt - 1), 2000) * (0.5 + Math.random());

async function apiGet(path) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(backoffMs(attempt));
    try {
      const res = await fetch(`https://api.pokemontcg.io/v2/${path}`, { headers: HEADERS });
      if (res.status >= 500) {
        lastErr = new Error(`pokemontcg.io ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`pokemontcg.io lookup failed: ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Cards can't reliably be found by `set.ptcgoCode` — the set records carry a
// ptcgoCode, but the card index's embedded set object frequently omits it, so
// that filter silently misses entire sets (Paldea Evolved among them). Set ids
// are always present on cards, so resolve the PTCGL code to set id(s) once via
// the /sets endpoint and query by id instead.
// The same index also carries each set's printedTotal, which is what separates a
// secret/art rare from a base-rarity print: secret rares are numbered above the
// set's printed total (Paldea Evolved prints 193 cards, so #278 is a secret).
// That's one cheap call for the whole collection, versus a per-card lookup.
const SET_META_CACHE_KEY = "someones-pc:setMeta:v1";
let setIndexPromise = null;
let setIndexSync = null;

function indexFromRows(rows) {
  const map = new Map();
  for (const s of rows) {
    if (!s.ptcgoCode) continue;
    const key = s.ptcgoCode.toUpperCase();
    if (!map.has(key)) map.set(key, { ids: [], printedTotal: 0 });
    const entry = map.get(key);
    entry.ids.push(s.id);
    // Sibling sets share a code (SIT -> swsh12 + swsh12tg); the main set's
    // printed total is the meaningful one, so keep the largest.
    entry.printedTotal = Math.max(entry.printedTotal, s.printedTotal || 0);
  }
  return map;
}

function loadSetIndex() {
  if (!setIndexPromise) {
    try {
      const raw = localStorage.getItem(SET_META_CACHE_KEY);
      if (raw) {
        setIndexSync = indexFromRows(JSON.parse(raw));
        setIndexPromise = Promise.resolve(setIndexSync);
      }
    } catch (e) {
      // ignore unusable storage
    }
  }
  if (!setIndexPromise) {
    setIndexPromise = apiGet("sets?pageSize=250")
      .then((data) => {
        const rows = (data?.data || []).map((s) => ({
          ptcgoCode: s.ptcgoCode,
          id: s.id,
          printedTotal: s.printedTotal,
        }));
        try {
          localStorage.setItem(SET_META_CACHE_KEY, JSON.stringify(rows));
        } catch (e) {
          // ignore quota problems
        }
        setIndexSync = indexFromRows(rows);
        return setIndexSync;
      })
      .catch(() => {
        setIndexPromise = null; // let a later call retry
        return new Map();
      });
  }
  return setIndexPromise;
}

// Resolves the set index for callers that need it before rendering.
export function loadSetMeta() {
  return loadSetIndex();
}


async function queryOnce(query) {
  const data = await apiGet(`cards?q=${encodeURIComponent(query)}&pageSize=1`);
  return data?.data?.[0] || null;
}

// A page rendering a big collection can ask for dozens of cards at once —
// without a cap that's dozens of simultaneous requests, which is exactly what
// trips the rate limit in the first place. This caps how many lookups are
// in flight at once; the rest wait their turn.
const MAX_CONCURRENT = 4;
let activeCount = 0;
const waiting = [];

function schedule(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeCount++;
      task().then(
        (v) => {
          activeCount--;
          drain();
          resolve(v);
        },
        (e) => {
          activeCount--;
          drain();
          reject(e);
        }
      );
    };
    if (activeCount < MAX_CONCURRENT) run();
    else waiting.push(run);
  });
}

function drain() {
  if (waiting.length && activeCount < MAX_CONCURRENT) waiting.shift()();
}

async function fetchCard(card) {
  const rawCode = card.set.toUpperCase();

  // Trainer Gallery subsets export as "SIT-TG 25" but live in the API as a
  // sibling set (swsh12tg) numbered "TG25".
  const tgMatch = rawCode.match(/^(.+)-TG$/);
  const code = tgMatch ? tgMatch[1] : rawCode;

  // PTCGL/Limitless exports aren't consistent about zero-padding card numbers
  // (e.g. "9" vs "09"), so try the number as given and stripped of leading
  // zeros before giving up.
  const stripped = card.number.replace(/^0+(?=\d)/, "");
  let numberVariants = stripped === card.number ? [card.number] : [card.number, stripped];
  if (tgMatch) numberVariants = numberVariants.map((n) => `TG${n}`);

  const setIndex = await loadSetIndex();
  const setIds = setIndex.get(code)?.ids || [];
  const setFilter = setIds.length
    ? setIds.length === 1
      ? `set.id:${setIds[0]}`
      : `(${setIds.map((id) => `set.id:${id}`).join(" OR ")})`
    : // Unknown code — the set list may predate a very new set. Fall back to
      // the ptcgoCode filter, which still works for some sets.
      `set.ptcgoCode:${code}`;

  async function attemptFind() {
    for (const num of numberVariants) {
      const hit = await queryOnce(`${setFilter} number:${num}`);
      if (hit) {
        return {
          images: hit.images || null,
          cardType: cardTypeFromApiCard(hit),
        };
      }
    }
    return null;
  }

  const first = await attemptFind();
  if (first) return first;

  // The API intermittently answers 200 with an empty result set for a card it
  // demonstrably has (the same query returns it moments later). Since a miss is
  // cached for the session, confirm it once before believing it — otherwise one
  // bad response permanently hides a card's art.
  await sleep(600);
  return attemptFind();
}

// Fetches (and caches) card art + resolved card type by set/number. Returns
// null if the card has no set/number, or the lookup finds nothing. A network
// error or rate limit is NOT cached — it resolves to null just for this call,
// so a later retry (re-render, reopening the tab) can still succeed once the
// API is reachable again, instead of permanently remembering "no art found".
export function getCardData(card) {
  if (!card.set || !card.number) return Promise.resolve(null);
  const key = cardCacheKey(card);
  if (resolved.has(key)) return Promise.resolve(resolved.get(key));
  if (!pending.has(key)) {
    const p = schedule(() => fetchCard(card)).then(
      (data) => {
        resolved.set(key, data);
        pending.delete(key);
        if (data) persistCache();
        return data;
      },
      () => {
        pending.delete(key);
        return null;
      }
    );
    pending.set(key, p);
  }
  return pending.get(key);
}

// Synchronous peek at an already-resolved result — undefined means "not looked
// up yet", distinct from null which means "looked up, nothing found".
export function getCachedCardData(card) {
  return resolved.get(cardCacheKey(card));
}

// Best-effort type guess for the quick-add form when no set/number was
// given, so getCardData (which requires both) can't run its exact-print
// lookup. Takes whichever print of the name comes back first -- fine here,
// since only cardType is used, and that's the same across every print of a
// given card. Not cached: a name-only match isn't tied to the specific print
// getCardData's cache key represents, so caching it under that key would be
// wrong once the real print is known.
export async function guessCardTypeByName(name) {
  if (!name || !name.trim()) return null;
  try {
    const hit = await schedule(() => queryOnce(`name:"${name.trim()}"`));
    return hit ? cardTypeFromApiCard(hit) : null;
  } catch (e) {
    return null;
  }
}

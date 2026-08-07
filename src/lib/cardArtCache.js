import { cardCacheKey } from "./pokemonTcgApi";

// Routes an image URL through /api/card-image, which caches the actual bytes
// permanently in Supabase Storage on first request and redirects straight
// there afterward — see api/card-image.js for why this has to be a server
// round-trip rather than something done in the browser.
//
// The cache key is the card's identity (name/set/number), not the source URL,
// so a live pokemontcg.io lookup and a manually pasted URL for the same print
// share one cached file rather than each getting their own.
//
// Only exists once deployed (there's no Vercel function under `vite dev`) —
// callers should keep a plain onError fallback to the original URL so local
// dev degrades to exactly today's behavior instead of a broken image.
export function cachedImageUrl(originalUrl, card) {
  if (!originalUrl) return undefined;
  const key = card ? cardCacheKey(card) : originalUrl;
  return `/api/card-image?src=${encodeURIComponent(originalUrl)}&key=${encodeURIComponent(key)}`;
}

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Permanently caches card art in Supabase Storage, keyed by the card's
// identity (name+set+number) rather than the source URL — so an image
// resolved via a live pokemontcg.io lookup and the same card's manually
// pasted URL land on the same cached file, whichever request arrives first.
//
// images.pokemontcg.io and TCGplayer's CDN both refuse cross-origin fetch, so
// the browser can display them in an <img> tag but can never read the bytes
// to cache them itself — the download has to happen server-side, which is
// what this function is for. It reuses the app's existing anon key rather
// than a service_role key; supabase/storage-setup.sql grants that key insert
// access scoped to just the "card-art" bucket, nothing else.

const BUCKET = "card-art";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

function cacheFileName(key) {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 40) + ".img";
}

export default async function handler(req, res) {
  const { src, key } = req.query;
  if (!src || typeof src !== "string") {
    res.status(400).send("Missing src");
    return;
  }

  // Cache our own response too — once a browser has followed the redirect
  // once, it doesn't need to ask this function again for a long time.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  const path = cacheFileName(String(key || src));
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // 301 vs 302 matters here beyond HTTP pedantry: a 301 is universally treated
  // as safe to cache long-term, even without an explicit Cache-Control header,
  // while a 302 is conventionally "temporary" and browsers — mobile Safari
  // especially — have been inconsistent about honoring Cache-Control on one.
  // Confirmed by testing: the deployed function was already returning 302 with
  // this same Cache-Control header, but repeat mobile loads were still slow,
  // consistent with the browser re-asking this function instead of caching
  // the redirect and going straight to Storage next time. The two paths below
  // that redirect to the real, permanent Storage location use 301; the
  // fallback path (redirecting to the original source because caching failed)
  // stays 302, since that's a degraded, temporary answer we don't want a
  // browser to lock in — the real cached copy might exist on the next request.
  try {
    const head = await fetch(publicUrl, { method: "HEAD" });
    if (head.ok) {
      res.redirect(301, publicUrl);
      return;
    }
  } catch (e) {
    // Storage unreachable — fall through and try the full fetch-and-cache path.
  }

  try {
    const sourceRes = await fetch(src);
    if (!sourceRes.ok) throw new Error(`source responded ${sourceRes.status}`);
    const contentType = sourceRes.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await sourceRes.arrayBuffer());

    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: true,
    });
    if (error) throw error;

    res.redirect(301, publicUrl);
  } catch (e) {
    // Cache miss and the origin fetch/upload failed too — send the browser
    // straight to the original image so it still has a chance to render,
    // same as before this proxy existed.
    res.redirect(302, src);
  }
}

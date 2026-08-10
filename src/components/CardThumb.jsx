import { useCardImage } from "../hooks/useCardImage";
import { cachedImageUrl } from "../lib/cardArtCache";

// The cache proxy only exists once deployed — there's no Vercel function
// under `vite dev` — so a failed request there falls back to the original
// URL, keeping local dev exactly as it worked before caching existed.
function CachedImg({ original, card, variant, alt, style }) {
  return (
    <img
      src={cachedImageUrl(original, card, variant)}
      alt={alt}
      style={style}
      loading="lazy"
      onError={(e) => {
        if (e.currentTarget.src !== original) {
          e.currentTarget.onerror = null;
          e.currentTarget.src = original;
        }
      }}
    />
  );
}

export function CardThumb({ card, w = 40, h = 56 }) {
  const apiImg = useCardImage(card, !!card.imageUrl);
  const box = {
    width: w,
    height: h,
    borderRadius: 5,
    flexShrink: 0,
    background: "var(--ink-800)",
    border: "1px solid var(--ink-700)",
    objectFit: "cover",
  };
  if (card.imageUrl) {
    return <CachedImg original={card.imageUrl} card={card} variant="custom" alt={card.name} style={box} />;
  }
  const img = apiImg;
  if (img === undefined) {
    return (
      <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--muted)" }}>
        ···
      </div>
    );
  }
  if (!img) {
    const initials = (card.name || "?")
      .split(" ")
      .map((w2) => w2[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    return (
      <div
        style={{
          ...box,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: w > 70 ? 22 : 11,
          color: "var(--muted)",
        }}
      >
        {initials}
      </div>
    );
  }
  const variant = w > 70 ? "large" : "small";
  const rawUrl = variant === "large" ? img.large : img.small;
  return <CachedImg original={rawUrl} card={card} variant={variant} alt={card.name} style={box} />;
}

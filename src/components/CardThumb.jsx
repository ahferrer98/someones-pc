import { useCardImage } from "../hooks/useCardImage";

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
    return <img src={card.imageUrl} alt={card.name} style={box} loading="lazy" />;
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
  return <img src={w > 70 ? img.large : img.small} alt={card.name} style={box} loading="lazy" />;
}

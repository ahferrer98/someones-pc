import { useEffect, useState } from "react";
import { getCardData, getCachedCardData } from "../lib/pokemonTcgApi";

// Card art lookup — matches on the same set/number shorthand used throughout the app,
// via the public pokemontcg.io API. A pasted card.imageUrl always wins over the live
// lookup (handled by the caller).
export function useCardImage(card, skip) {
  const cached = card ? getCachedCardData(card) : undefined;
  const [img, setImg] = useState(cached !== undefined ? (cached ? cached.images : null) : undefined);

  useEffect(() => {
    if (skip || !card) return;
    if (!card.set || !card.number) {
      setImg(null);
      return;
    }
    let cancelled = false;
    getCardData(card).then((data) => {
      if (!cancelled) setImg(data ? data.images : null);
    });
    return () => {
      cancelled = true;
    };
  }, [card && card.name, card && card.set, card && card.number, skip]);

  return img;
}

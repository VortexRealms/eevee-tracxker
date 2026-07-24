import type { PokemonCard } from "../types";

/** Strip leading zeros for Cardmarket search (e.g. "004" -> "4", "01 01/15" -> "1 1/15"). */
export function normalizeCardNumberForCardmarket(number: string): string {
  const raw = (number ?? "").trim();
  if (/^\d+$/.test(raw)) {
    return String(parseInt(raw, 10));
  }
  return raw.replace(/(^|\D)0+(\d)/g, "$1$2");
}

export function getCardmarketSearchUrl(
  card: Pick<PokemonCard, "name" | "number">
): string {
  const query = `${card.name} ${normalizeCardNumberForCardmarket(card.number)}`;
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchMode=v2&idCategory=0&searchString=${encodeURIComponent(query)}&idRarity=0`;
}

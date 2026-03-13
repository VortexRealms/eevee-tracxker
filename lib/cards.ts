import cardsData from "../data/cards.json";
import pricesData from "../data/prices.json";
import manualPricesData from "../data/manual-prices.json";
import type { CardPricing, CollectionRow, MergedCard, PokemonCard } from "../types";

type PricesMap = Record<string, { usd?: number | null; eur?: number | null; updatedAt?: string }>;
type ManualPricesMap = Record<string, { usd?: number; eur?: number }>;

export function getAllCards(): PokemonCard[] {
  const prices = pricesData as PricesMap;
  const manualPrices = manualPricesData as ManualPricesMap;

  return (cardsData as PokemonCard[]).map((card) => {
    const entry = prices[card.id] ?? manualPrices[card.id];
    if (!entry) return card;
    const pricing: CardPricing = {
      usd: entry.usd ?? null,
      eur: entry.eur ?? null,
      updatedAt: (entry as any).updatedAt,
    };
    return { ...card, pricing };
  });
}

/** Returns the EUR→USD exchange rate stored in prices.json, with a safe fallback. */
export function getEurUsdRate(): number {
  const meta = (pricesData as any)._meta;
  return typeof meta?.eurUsdRate === "number" && meta.eurUsdRate > 0
    ? meta.eurUsdRate
    : 1.08;
}

export function mergeCardsWithCollection(
  cards: PokemonCard[],
  collection: CollectionRow[]
): MergedCard[] {
  const byId = new Map(collection.map((row) => [row.cardId, row]));
  return cards.map((card) => ({
    ...card,
    collection: byId.get(card.id) ?? null
  }));
}


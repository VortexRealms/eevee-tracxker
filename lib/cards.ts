import cardsData from "../data/cards.json";
import pricesData from "../data/prices.json";
import type { CardPricing, CollectionRow, MergedCard, PokemonCard } from "../types";

type PricesMap = Record<string, { usd?: number | null; eur?: number | null; updatedAt?: string }>;

export function getAllCards(): PokemonCard[] {
  const prices = pricesData as PricesMap;
  return (cardsData as PokemonCard[]).map((card) => {
    const entry = prices[card.id];
    if (!entry) return card;
    const pricing: CardPricing = {
      usd: entry.usd ?? null,
      eur: entry.eur ?? null,
      updatedAt: entry.updatedAt,
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


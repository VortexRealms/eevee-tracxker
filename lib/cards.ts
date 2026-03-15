import cardsData from "../data/cards.json";
import pricesData from "../data/prices.json";
import manualPricesData from "../data/manual-prices.json";
import type { CardPricing, CollectionRow, MergedCard, PokemonCard } from "../types";

type VariantPrice = { usd?: number | null; eur?: number | null };
type PricesMap = Record<
  string,
  { usd?: number | null; eur?: number | null; updatedAt?: string; variants?: Record<string, VariantPrice> }
>;
type ManualVariantPrice = { usd?: number; eur?: number };
type ManualPricesMap = Record<
  string,
  { usd?: number; eur?: number; variants?: Record<string, ManualVariantPrice> }
>;

export function getAllCards(): PokemonCard[] {
  const prices = pricesData as PricesMap;
  const manualPrices = manualPricesData as ManualPricesMap;

  return (cardsData as PokemonCard[]).map((card) => {
    const base = prices[card.id];
    const manual = manualPrices[card.id];
    if (!base && !manual) return card;
    const pricing: CardPricing = {
      usd: base?.usd ?? manual?.usd ?? null,
      eur: base?.eur ?? manual?.eur ?? null,
      updatedAt: (base as any)?.updatedAt,
    };
    return { ...card, pricing };
  });
}

/** Parse composite cardId (e.g. "sv8pt5-74:normal") into base id and variant. */
export function parseCardIdAndVariant(
  composite: string
): { cardId: string; variant: string } {
  const colon = composite.indexOf(":");
  if (colon >= 0) {
    return {
      cardId: composite.slice(0, colon),
      variant: composite.slice(colon + 1) || "normal"
    };
  }
  return { cardId: composite, variant: "normal" };
}

/** Returns the EUR→USD exchange rate stored in prices.json, with a safe fallback. */
export function getEurUsdRate(): number {
  const meta = (pricesData as any)._meta;
  return typeof meta?.eurUsdRate === "number" && meta.eurUsdRate > 0
    ? meta.eurUsdRate
    : 1.08;
}

export interface ResolvedPrice {
  usd: number | null;
  eur: number | null;
}

/**
 * Get price for a card, optionally for a specific variant.
 * All/Missing: use getPriceForCard(card) for normal price.
 * Owned: use getPriceForCard(card, variant) for variant-specific price when available.
 * Merges prices.json (primary) with manual-prices.json (fallback) at field level.
 */
export function getPriceForCard(
  card: PokemonCard,
  variant?: string
): ResolvedPrice {
  const prices = pricesData as PricesMap;
  const manualPrices = manualPricesData as ManualPricesMap;
  const base = prices[card.id];
  const manual = manualPrices[card.id];

  const v = variant ?? "normal";
  let baseVariant = base?.variants?.[v];
  let manualVariant = manual?.variants?.[v];

  // When reverse has no price, use holo as fallback (before card-level)
  if (v === "reverse") {
    if (!baseVariant?.usd && !baseVariant?.eur) baseVariant = base?.variants?.["holo"];
    if (!manualVariant?.usd && !manualVariant?.eur) manualVariant = manual?.variants?.["holo"];
  }

  const usd =
    baseVariant?.usd ??
    base?.usd ??
    manualVariant?.usd ??
    manual?.usd ??
    null;
  const eur =
    baseVariant?.eur ??
    base?.eur ??
    manualVariant?.eur ??
    manual?.eur ??
    null;

  return {
    usd: typeof usd === "number" ? usd : null,
    eur: typeof eur === "number" ? eur : null
  };
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


import cardsData from "../data/cards.json";
import { normalizePriceAmount } from "./parse-price";
import type {
  CollectionRow,
  MergedCard,
  PokemonCard,
  PriceEntry,
  PricesMeta,
  PricesSnapshot,
} from "../types";

export function getAllCards(): PokemonCard[] {
  return cardsData as PokemonCard[];
}

/** Parse composite cardId (e.g. "sv8pt5-74:normal") into base id and variant. */
export function parseCardIdAndVariant(
  composite: string
): { cardId: string; variant: string } {
  const colon = composite.indexOf(":");
  if (colon >= 0) {
    return {
      cardId: composite.slice(0, colon),
      variant: composite.slice(colon + 1) || "normal",
    };
  }
  return { cardId: composite, variant: "normal" };
}

export interface ResolvedPrice {
  usd: number | null;
  eur: number | null;
}

type VariantPrices = NonNullable<PriceEntry["variants"]>;

function readVariantPrices(
  prices: { usd?: number | null; eur?: number | null } | undefined
): ResolvedPrice {
  return {
    usd: normalizePriceAmount(prices?.usd),
    eur: normalizePriceAmount(prices?.eur),
  };
}

function hasPrice(price: ResolvedPrice): boolean {
  return price.usd != null || price.eur != null;
}

/**
 * When a card has exactly one catalogue variant but Pokewallet uses another key
 * (e.g. TCGdex holo-only, API normal-only), map to the available price entry.
 */
export function resolveSingleVariantAlias(
  card: PokemonCard,
  variants: VariantPrices | undefined
): ResolvedPrice {
  if (!variants || card.variants?.length !== 1) {
    return { usd: null, eur: null };
  }

  const catalogueVariant = card.variants[0];
  const pricedEntries = Object.entries(variants).filter(([, p]) =>
    hasPrice(readVariantPrices(p))
  );

  if (pricedEntries.length === 1) {
    return readVariantPrices(pricedEntries[0][1]);
  }

  if (catalogueVariant === "holo" && hasPrice(readVariantPrices(variants.normal))) {
    return readVariantPrices(variants.normal);
  }

  if (catalogueVariant === "normal" && hasPrice(readVariantPrices(variants.holo))) {
    return readVariantPrices(variants.holo);
  }

  return { usd: null, eur: null };
}

const EMPTY_SNAPSHOT: PricesSnapshot = {
  meta: { ratesUpdatedAt: "" },
  entries: {},
};

/**
 * Default variant for All/Missing price display (first variant on the card).
 */
export function defaultPriceVariant(card: PokemonCard): string {
  const variants = card.variants?.length ? card.variants : ["normal"];
  return variants[0];
}

/**
 * Get price for a card variant. Multi-variant cards use strict key lookup only.
 * Single-variant cards may alias when Pokewallet uses a different variantsJson key
 * (e.g. catalogue holo, API normal).
 */
export function getPriceForCard(
  card: PokemonCard,
  variant: string | undefined,
  prices: PricesSnapshot | null | undefined
): ResolvedPrice {
  const snapshot = prices ?? EMPTY_SNAPSHOT;
  const base = snapshot.entries[card.id];

  const v = variant ?? "normal";
  const strict = readVariantPrices(base?.variants?.[v]);
  if (hasPrice(strict)) return strict;

  if (card.variants?.length === 1) {
    const aliased = resolveSingleVariantAlias(card, base?.variants);
    if (hasPrice(aliased)) return aliased;
  }

  return { usd: null, eur: null };
}

export function mergeCardsWithCollection(
  cards: PokemonCard[],
  collection: CollectionRow[]
): MergedCard[] {
  const byId = new Map(collection.map((row) => [row.cardId, row]));
  return cards.map((card) => ({
    ...card,
    collection: byId.get(card.id) ?? null,
  }));
}

export type { PriceEntry, PricesSnapshot, PricesMeta };

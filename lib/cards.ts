import cardsData from "../data/cards.json";
import { normalizePriceAmount } from "./parse-price";
import type {
  CollectionRow,
  MergedCard,
  PokemonCard,
  PriceEntry,
  PricesMeta,
  PricesSnapshot,
  VariantPriceRecord,
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
  updatedAt?: string;
  source?: import("../types").PriceSource;
  priceKind?: import("../types").PriceKind;
  sampleCount?: number;
}

type VariantPrices = NonNullable<PriceEntry["variants"]>;

function recordToResolved(
  record: VariantPrices[string] | undefined
): ResolvedPrice {
  return {
    usd: normalizePriceAmount(record?.usd),
    eur: normalizePriceAmount(record?.eur),
    updatedAt: record?.updatedAt,
    source: record?.source,
    priceKind: record?.priceKind,
    sampleCount: record?.sampleCount,
  };
}

function readVariantPrices(
  prices: VariantPrices[string] | undefined
): ResolvedPrice {
  return recordToResolved(prices);
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

/** Cards where Pokewallet splits TCG holo USD and CM normal EUR onto separate keys. */
const NORMAL_ONTO_HOLO_MERGE_IDS = new Set(["smp-SM240", "sm11-72"]);

export function shouldMergeNormalOntoHolo(card: PokemonCard): boolean {
  return NORMAL_ONTO_HOLO_MERGE_IDS.has(card.id);
}

/** @deprecated Use shouldMergeNormalOntoHolo */
export function isHoloOnlyPromoCard(card: PokemonCard): boolean {
  return shouldMergeNormalOntoHolo(card);
}

function mergeHoloOnlyPromoVariantRecords(
  holo: VariantPrices[string] | undefined,
  normal: VariantPrices[string] | undefined,
  entry: PriceEntry
): VariantPriceRecord | null {
  const usd =
    normalizePriceAmount(holo?.usd) ?? normalizePriceAmount(normal?.usd);
  const eur =
    normalizePriceAmount(normal?.eur) ?? normalizePriceAmount(holo?.eur);
  if (usd == null && eur == null) return null;

  return {
    usd,
    eur,
    updatedAt: holo?.updatedAt ?? normal?.updatedAt ?? entry.updatedAt,
    source: holo?.source ?? normal?.source ?? entry.source ?? "pokewallet",
    priceKind: holo?.priceKind ?? normal?.priceKind,
    sampleCount: holo?.sampleCount ?? normal?.sampleCount,
    metadata: holo?.metadata ?? normal?.metadata,
  };
}

/** Collapse Pokewallet normal+holo keys onto catalogue holo for holo-only promos. */
export function mergeHoloOnlyPromoPriceEntry(
  card: PokemonCard,
  entry: PriceEntry
): PriceEntry {
  if (!shouldMergeNormalOntoHolo(card) || !entry.variants) return entry;

  const mergedHolo = mergeHoloOnlyPromoVariantRecords(
    entry.variants.holo,
    entry.variants.normal,
    entry
  );
  if (!mergedHolo) return entry;

  const { normal: _removed, ...rest } = entry.variants;
  return { ...entry, variants: { ...rest, holo: mergedHolo } };
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
  const record = getVariantPriceRecord(card, v, base);
  if (record && hasPrice(recordToResolved(record))) {
    return {
      ...recordToResolved(record),
      source: record.source ?? base?.source,
      priceKind:
        record.priceKind ??
        (base?.source === "manual" ? "manual" : record.priceKind),
    };
  }

  if (card.variants?.length === 1) {
    const aliased = resolveSingleVariantAlias(card, base?.variants);
    if (hasPrice(aliased)) {
      const record = getVariantPriceRecord(card, v, base);
      return {
        ...aliased,
        updatedAt: record?.updatedAt ?? base?.updatedAt,
        source: record?.source ?? base?.source,
        priceKind: record?.priceKind,
        sampleCount: record?.sampleCount,
      };
    }
  }

  return { usd: null, eur: null };
}

/**
 * Resolve the effective variant price record for a catalogue slot, including
 * single-variant alias behavior when Pokewallet uses a different variantsJson key.
 */
export function getVariantPriceRecord(
  card: PokemonCard,
  variant: string | undefined,
  entry: PriceEntry | undefined
): VariantPriceRecord | null {
  if (!entry) return null;

  const v = variant ?? "normal";

  if (v === "holo" && shouldMergeNormalOntoHolo(card) && entry.variants) {
    const merged = mergeHoloOnlyPromoVariantRecords(
      entry.variants.holo,
      entry.variants.normal,
      entry
    );
    if (merged) return merged;
  }

  const strict = entry.variants?.[v];
  if (strict && hasPrice(readVariantPrices(strict))) {
    return {
      ...strict,
      usd: normalizePriceAmount(strict.usd),
      eur: normalizePriceAmount(strict.eur),
      updatedAt: strict.updatedAt ?? entry.updatedAt,
      source: strict.source ?? entry.source,
      priceKind: strict.priceKind,
    };
  }

  if (card.variants?.length === 1 && entry.variants) {
    const singleAlias = resolveSingleVariantAlias(card, entry.variants);
    if (hasPrice(singleAlias)) {
      const pricedEntry = Object.entries(entry.variants).find(([, p]) =>
        hasPrice(readVariantPrices(p))
      );
      const record = pricedEntry?.[1];
      return {
        usd: singleAlias.usd,
        eur: singleAlias.eur,
        updatedAt: record?.updatedAt ?? entry.updatedAt,
        source: record?.source ?? entry.source,
        priceKind: record?.priceKind,
        sampleCount: record?.sampleCount,
        metadata: record?.metadata,
      };
    }
  }

  return null;
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

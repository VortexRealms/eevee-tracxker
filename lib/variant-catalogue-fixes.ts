/**
 * Targeted catalogue corrections where TCGdex variant slots disagree with
 * market data (Pokewallet / Cardmarket sub-types).
 */

import type { PriceEntry } from "../types";

/** Authoritative variant lists applied during catalogue merge. */
export const CATALOGUE_VARIANT_OVERRIDES: Record<string, string[]> = {
  // Holo Rare only — no non-holo printing; Pokewallet lists Holofoil + Reverse Holofoil
  // but TCGdex labels are inverted vs Cardmarket for this card.
  "col1-22": ["holo", "reverse"],
};

/**
 * Maps a catalogue variant to the key used in Pokewallet price snapshots / SQLite
 * before we renamed slots. col1-22: catalogue holo ↔ storage reverse, etc.
 */
export const VARIANT_PRICE_STORAGE_ALIASES: Record<
  string,
  Record<string, string>
> = {
  "col1-22": {
    holo: "reverse",
    reverse: "holo",
  },
};

/** Legacy ownership variant keys → new catalogue key (null = drop). */
export const VARIANT_OWNERSHIP_MIGRATIONS: Record<
  string,
  Record<string, string | null>
> = {
  "col1-22": {
    reverse: "holo",
    holo: "reverse",
    normal: null,
  },
};

export function resolvePriceStorageVariant(
  cardId: string,
  catalogueVariant: string
): string {
  return (
    VARIANT_PRICE_STORAGE_ALIASES[cardId]?.[catalogueVariant] ??
    catalogueVariant
  );
}

export function migrateOwnershipVariant(
  cardId: string,
  variant: string
): string | null {
  const map = VARIANT_OWNERSHIP_MIGRATIONS[cardId];
  if (!map) return variant;
  if (Object.prototype.hasOwnProperty.call(map, variant)) {
    return map[variant] ?? null;
  }
  return variant;
}

/** Remap Pokewallet storage keys onto catalogue variant keys after fetch. */
export function remapPriceEntryVariantsToCatalogue(
  cardId: string,
  entry: PriceEntry
): PriceEntry {
  const aliases = VARIANT_PRICE_STORAGE_ALIASES[cardId];
  if (!aliases || Object.keys(aliases).length === 0) return entry;
  if (!entry.variants) return entry;

  const remapped: NonNullable<PriceEntry["variants"]> = {};
  for (const [storageKey, record] of Object.entries(entry.variants)) {
    const catalogueKey =
      Object.entries(aliases!).find(([, mapped]) => mapped === storageKey)?.[0] ??
      storageKey;
    remapped[catalogueKey] = record;
  }

  const usdOrder = ["normal", "reverse", "holo", "firstEdition"];
  const eurOrder = ["normal", "holo", "reverse", "firstEdition"];
  let usd: number | null = null;
  let eur: number | null = null;
  for (const key of usdOrder) {
    const value = remapped[key]?.usd ?? null;
    if (value != null) {
      usd = value;
      break;
    }
  }
  for (const key of eurOrder) {
    const value = remapped[key]?.eur ?? null;
    if (value != null) {
      eur = value;
      break;
    }
  }

  return { ...entry, usd, eur, variants: remapped };
}

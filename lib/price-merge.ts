import type { PriceEntry } from "../types";
import { bestEntryLevelPrices, normalizePriceEntry } from "./price-entry-utils";

/** Variants Pokewallet typically does not fetch — useful for docs/tests. */
export const POKEMON_MANUAL_VARIANT_HINTS = ["pokeball", "masterball"] as const;

type VariantPrices = NonNullable<PriceEntry["variants"]>;
type VariantPrice = VariantPrices[string];

export function variantHasPrice(prices: VariantPrice | undefined): boolean {
  if (!prices) return false;
  return (
    (typeof prices.usd === "number" && Number.isFinite(prices.usd)) ||
    (typeof prices.eur === "number" && Number.isFinite(prices.eur))
  );
}

/**
 * Merge Pokewallet fetch into an existing Sheet entry. Pokewallet wins per key when
 * it returns priced data; manual-only keys (e.g. pokeball) are preserved.
 */
export function mergePriceEntries(
  fetched: PriceEntry,
  existing: PriceEntry | undefined
): PriceEntry {
  const mergedVariants: VariantPrices = { ...(fetched.variants ?? {}) };

  if (existing?.variants) {
    for (const [key, prices] of Object.entries(existing.variants)) {
      const fetchedVariant = fetched.variants?.[key];
      if (!variantHasPrice(fetchedVariant) && variantHasPrice(prices)) {
        mergedVariants[key] = { ...prices };
      }
    }
  }

  const withVariants: PriceEntry = {
    ...fetched,
    variants: Object.keys(mergedVariants).length > 0 ? mergedVariants : undefined,
  };

  const rowLevel = bestEntryLevelPrices(withVariants);
  return normalizePriceEntry({
    ...withVariants,
    usd: rowLevel.usd ?? fetched.usd ?? null,
    eur: rowLevel.eur ?? fetched.eur ?? null,
  });
}

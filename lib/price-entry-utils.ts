import type { PriceEntry } from "../types";
import { normalizePriceAmount, parsePriceCell } from "./parse-price";

const DEFAULT_EUR_USD_RATE = 1.08;
const MIN_EUR_USD_RATE = 0.5;
const MAX_EUR_USD_RATE = 2;

type VariantPrices = Record<string, { usd?: number | null; eur?: number | null }>;

function firstVariantPrice(
  variants: VariantPrices,
  field: "usd" | "eur",
  order: string[]
): number | null {
  for (const key of order) {
    const value = normalizePriceAmount(variants[key]?.[field]);
    if (value != null) return value;
  }
  for (const prices of Object.values(variants)) {
    const value = normalizePriceAmount(prices?.[field]);
    if (value != null) return value;
  }
  return null;
}

/** Card-level USD/EUR derived from variant map (matches fetch logic). */
export function bestEntryLevelPrices(entry: Pick<PriceEntry, "variants">): {
  usd: number | null;
  eur: number | null;
} {
  const variants = entry.variants;
  if (!variants || Object.keys(variants).length === 0) {
    return { usd: null, eur: null };
  }
  return {
    usd: firstVariantPrice(variants, "usd", ["normal", "reverse", "holo", "firstEdition"]),
    eur: firstVariantPrice(variants, "eur", ["normal", "holo", "reverse", "firstEdition"]),
  };
}

/**
 * Parse EUR/USD rate from Sheet meta. Recovers comma-stripped values like 11435 → 1.1435.
 */
export function parseEurUsdRate(value: unknown): number {
  let rate = parsePriceCell(value);
  if (rate === null || rate < MIN_EUR_USD_RATE || rate > MAX_EUR_USD_RATE) {
    if (rate !== null && rate > MAX_EUR_USD_RATE) {
      for (const divisor of [10_000, 1_000, 100]) {
        const scaled = rate / divisor;
        if (scaled >= MIN_EUR_USD_RATE && scaled <= MAX_EUR_USD_RATE) {
          return scaled;
        }
      }
    }
    return DEFAULT_EUR_USD_RATE;
  }
  return rate;
}

/** Prefer variant-derived card-level prices when variantsJson is present. */
export function normalizePriceEntry(entry: PriceEntry): PriceEntry {
  if (!entry.variants || Object.keys(entry.variants).length === 0) {
    return entry;
  }
  const fromVariants = bestEntryLevelPrices(entry);
  return {
    ...entry,
    usd: fromVariants.usd ?? entry.usd ?? null,
    eur: fromVariants.eur ?? entry.eur ?? null,
  };
}

export { DEFAULT_EUR_USD_RATE };

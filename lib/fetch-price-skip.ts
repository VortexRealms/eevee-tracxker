import type { PriceEntry, VariantPriceRecord } from "../types";
import { shouldSkipVariantFetch } from "./variant-price-contract";

export type SkipPriceFetchReason = "manual" | "fresh";

export interface SkipPriceFetchResult {
  skip: boolean;
  reason?: SkipPriceFetchReason;
}

/** Local calendar date YYYY-MM-DD (matches Task Scheduler / daily wrapper). */
export function localTodayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Normalize Sheet column D to a date part (handles future datetime values). */
export function priceDatePart(updatedAt: string | undefined): string | null {
  if (!updatedAt?.trim()) return null;
  const part = updatedAt.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null;
}

/** Card-level skip: all variants manual, or all fresh when card-level updatedAt matches today. */
export function shouldSkipPriceFetch(
  entry: PriceEntry | undefined,
  today: string,
  force: boolean
): SkipPriceFetchResult {
  if (!entry) return { skip: false };

  const variants = entry.variants;
  if (variants && Object.keys(variants).length > 0) {
    const pricedVariants = Object.values(variants).filter(
      (v) => v.usd != null || v.eur != null
    );
    if (
      pricedVariants.length > 0 &&
      pricedVariants.every((v) => v.source === "manual")
    ) {
      return { skip: true, reason: "manual" };
    }
    if (!force) {
      const allFresh = pricedVariants.every(
        (v) => v.updatedAt && priceDatePart(v.updatedAt) === today
      );
      if (pricedVariants.length > 0 && allFresh) {
        return { skip: true, reason: "fresh" };
      }
    }
    return { skip: false };
  }

  if (entry.source === "manual") {
    return { skip: true, reason: "manual" };
  }
  if (!force && entry.updatedAt && priceDatePart(entry.updatedAt) === today) {
    return { skip: true, reason: "fresh" };
  }
  return { skip: false };
}

export function shouldSkipVariantPriceFetch(
  record: VariantPriceRecord | undefined,
  today: string,
  force: boolean
): SkipPriceFetchResult {
  const result = shouldSkipVariantFetch(record, today, force);
  return { skip: result.skip, reason: result.reason };
}

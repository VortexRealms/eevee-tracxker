import type { PriceEntry } from "../types";

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

export function shouldSkipPriceFetch(
  entry: PriceEntry | undefined,
  today: string,
  force: boolean
): SkipPriceFetchResult {
  if (entry?.source === "manual") {
    return { skip: true, reason: "manual" };
  }
  if (!force && entry?.updatedAt && priceDatePart(entry.updatedAt) === today) {
    return { skip: true, reason: "fresh" };
  }
  return { skip: false };
}

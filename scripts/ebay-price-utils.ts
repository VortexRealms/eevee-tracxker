/**
 * eBay listing matching and asking-median estimation helpers.
 */

import type { ExchangeRates } from "../lib/exchange-rates";
import type { EbayPriceMapping } from "../lib/ebay-price-mappings";
import type { VariantPriceRecord } from "../types";
import { normalizePriceAmount } from "../lib/parse-price";
import type { EbayBrowseItemSummary } from "./ebay-browse-client";

export interface AcceptedListing {
  itemId: string;
  title: string;
  totalUsd: number;
  itemUsd: number;
  shippingUsd: number;
}

export interface RejectedListing {
  itemId: string;
  title: string;
  reason: string;
}

export interface EbayMedianEstimate {
  record: VariantPriceRecord | null;
  accepted: AcceptedListing[];
  rejected: RejectedListing[];
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function titleTokens(title: string): string[] {
  return normalizeTitle(title).split(" ").filter(Boolean);
}

function hasAllTerms(title: string, terms: string[]): boolean {
  const tokens = titleTokens(title);
  const norm = normalizeTitle(title);
  return terms.every((term) => {
    const t = term.toLowerCase();
    return tokens.includes(t) || norm.includes(` ${t} `);
  });
}

function hasAnyTerm(title: string, terms: string[]): boolean {
  const tokens = new Set(titleTokens(title));
  return terms.some((term) => tokens.has(term.toLowerCase()));
}

function parseMoney(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function toUsd(amount: number, currency: string | undefined, rates: ExchangeRates): number | null {
  const code = (currency ?? "USD").toUpperCase();
  if (code === "USD") return amount;
  if (code === "EUR") return amount * rates.eurUsdRate;
  const usdPerUnit = rates.usdRates[code as keyof typeof rates.usdRates];
  if (usdPerUnit != null) return amount / usdPerUnit;
  return null;
}

export function listingTotalUsd(
  item: EbayBrowseItemSummary,
  rates: ExchangeRates
): { totalUsd: number; itemUsd: number; shippingUsd: number } | null {
  const itemAmount = parseMoney(item.price?.value);
  if (itemAmount == null) return null;
  const itemUsd = toUsd(itemAmount, item.price?.currency, rates);
  if (itemUsd == null) return null;

  let shippingUsd = 0;
  const shipping = item.shippingOptions?.[0]?.shippingCost;
  const shippingAmount = parseMoney(shipping?.value);
  if (shippingAmount != null) {
    const converted = toUsd(shippingAmount, shipping?.currency ?? item.price?.currency, rates);
    if (converted != null) shippingUsd = converted;
  }

  return { totalUsd: itemUsd + shippingUsd, itemUsd, shippingUsd };
}

export function isFixedPriceListing(item: EbayBrowseItemSummary): boolean {
  const options = item.buyingOptions ?? [];
  if (options.length === 0) return true;
  return options.some((opt) => opt.toUpperCase().includes("FIXED"));
}

export function matchesEbayListingTitle(
  title: string,
  mapping: EbayPriceMapping
): { ok: boolean; reason?: string } {
  if (!hasAllTerms(title, mapping.requiredTerms)) {
    return { ok: false, reason: "missing required term" };
  }
  if (mapping.preferredTerms?.length && !hasAnyTerm(title, mapping.preferredTerms)) {
    return { ok: false, reason: "missing preferred term" };
  }
  if (mapping.excludedTerms?.length && hasAnyTerm(title, mapping.excludedTerms)) {
    return { ok: false, reason: "matched excluded term" };
  }
  return { ok: true };
}

function quartiles(values: number[]): { q1: number; q3: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor((sorted.length - 1) * 0.25)];
  const q3 = sorted[Math.floor((sorted.length - 1) * 0.75)];
  return { q1, q3 };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function filterIqrOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const { q1, q3 } = quartiles(values);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return values.filter((v) => v >= lower && v <= upper);
}

export function estimateEbayAskingMedian(input: {
  items: EbayBrowseItemSummary[];
  mapping: EbayPriceMapping;
  rates: ExchangeRates;
  updatedAt: string;
}): EbayMedianEstimate {
  const accepted: AcceptedListing[] = [];
  const rejected: RejectedListing[] = [];
  const seen = new Set<string>();

  for (const item of input.items) {
    const itemId = item.itemId;
    const title = item.title ?? "";
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);

    if (!isFixedPriceListing(item)) {
      rejected.push({ itemId, title, reason: "not fixed price" });
      continue;
    }

    const titleMatch = matchesEbayListingTitle(title, input.mapping);
    if (!titleMatch.ok) {
      rejected.push({ itemId, title, reason: titleMatch.reason ?? "title mismatch" });
      continue;
    }

    const totals = listingTotalUsd(item, input.rates);
    if (!totals) {
      rejected.push({ itemId, title, reason: "missing/unsupported price" });
      continue;
    }

    accepted.push({
      itemId,
      title,
      totalUsd: totals.totalUsd,
      itemUsd: totals.itemUsd,
      shippingUsd: totals.shippingUsd,
    });
  }

  const minSamples = Math.max(1, input.mapping.minSamples ?? 2);
  const totals = accepted.map((a) => a.totalUsd);
  const filtered = filterIqrOutliers(totals);
  const med = median(filtered);

  if (med == null || filtered.length < minSamples) {
    return { record: null, accepted, rejected };
  }

  const eur = med / input.rates.eurUsdRate;
  const { q1, q3 } = quartiles(filtered);

  return {
    record: {
      usd: normalizePriceAmount(med),
      eur: normalizePriceAmount(eur),
      updatedAt: input.updatedAt,
      source: "ebay",
      priceKind: "active_listing_median",
      sampleCount: filtered.length,
      metadata: {
        provider: "ebay",
        mappingVersion: input.mapping.mappingVersion ?? null,
        minUsd: Math.min(...filtered),
        maxUsd: Math.max(...filtered),
        q1Usd: q1,
        q3Usd: q3,
        queryCount: input.mapping.queries.length,
      },
    },
    accepted,
    rejected,
  };
}

import type { PokemonCard, PriceEntry, PriceKind, PriceSource, VariantPriceRecord } from "../types";
import { getVariantPriceRecord } from "./cards";
import { normalizePriceAmount } from "./parse-price";

export const PRICE_DB_USER_VERSION = 1;

export interface VariantPriceRow {
  cardId: string;
  variant: string;
  usd: number | null;
  eur: number | null;
  updatedAt: string;
  source: PriceSource;
  priceKind: PriceKind;
  sampleCount?: number | null;
  metadata?: Record<string, unknown>;
  orphan?: boolean;
}

export function variantHasAmount(record: VariantPriceRecord | undefined): boolean {
  if (!record) return false;
  return (
    normalizePriceAmount(record.usd) != null ||
    normalizePriceAmount(record.eur) != null
  );
}

export function defaultPriceKindForSource(source: PriceSource): PriceKind {
  if (source === "manual") return "manual";
  if (source === "ebay") return "active_listing_median";
  return "market";
}

export function normalizeVariantPriceRecord(
  input: VariantPriceRecord,
  fallbackSource: PriceSource = "pokewallet"
): VariantPriceRecord {
  const source = input.source ?? fallbackSource;
  return {
    usd: normalizePriceAmount(input.usd),
    eur: normalizePriceAmount(input.eur),
    updatedAt: input.updatedAt,
    source,
    priceKind: input.priceKind ?? defaultPriceKindForSource(source),
    ...(input.sampleCount != null ? { sampleCount: input.sampleCount } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function variantRowFromRecord(
  cardId: string,
  variant: string,
  record: VariantPriceRecord,
  options: { orphan?: boolean; fallbackSource?: PriceSource } = {}
): VariantPriceRow {
  const normalized = normalizeVariantPriceRecord(
    record,
    options.fallbackSource ?? "pokewallet"
  );
  return {
    cardId,
    variant,
    usd: normalized.usd ?? null,
    eur: normalized.eur ?? null,
    updatedAt: normalized.updatedAt ?? "",
    source: normalized.source ?? options.fallbackSource ?? "pokewallet",
    priceKind: normalized.priceKind ?? defaultPriceKindForSource(normalized.source ?? "pokewallet"),
    sampleCount: normalized.sampleCount ?? null,
    metadata: normalized.metadata,
    orphan: options.orphan,
  };
}

/** Card-level USD/EUR derived from variant rows (matches fetch logic). */
export function bestCardLevelFromVariants(
  variants: Record<string, VariantPriceRecord> | undefined
): { usd: number | null; eur: number | null } {
  if (!variants || Object.keys(variants).length === 0) {
    return { usd: null, eur: null };
  }
  const usdOrder = ["normal", "reverse", "holo", "firstEdition"];
  const eurOrder = ["normal", "holo", "reverse", "firstEdition"];
  const variantMap = variants;

  function first(field: "usd" | "eur", order: string[]): number | null {
    for (const key of order) {
      const value = normalizePriceAmount(variantMap[key]?.[field]);
      if (value != null) return value;
    }
    for (const prices of Object.values(variantMap)) {
      const value = normalizePriceAmount(prices?.[field]);
      if (value != null) return value;
    }
    return null;
  }

  return { usd: first("usd", usdOrder), eur: first("eur", eurOrder) };
}

export function groupVariantRowsToEntries(
  rows: VariantPriceRow[]
): Record<string, PriceEntry> {
  const byCard = new Map<string, Record<string, VariantPriceRecord>>();

  for (const row of rows) {
    if (row.orphan) continue;
    const variants = byCard.get(row.cardId) ?? {};
    variants[row.variant] = {
      usd: row.usd,
      eur: row.eur,
      updatedAt: row.updatedAt,
      source: row.source,
      priceKind: row.priceKind,
      ...(row.sampleCount != null ? { sampleCount: row.sampleCount } : {}),
      ...(row.metadata ? { metadata: row.metadata } : {}),
    };
    byCard.set(row.cardId, variants);
  }

  const entries: Record<string, PriceEntry> = {};
  for (const [cardId, variants] of byCard) {
    const rowLevel = bestCardLevelFromVariants(variants);
    const updatedAt =
      Object.values(variants)
        .map((v) => v.updatedAt)
        .filter(Boolean)
        .sort()
        .pop() ?? "";
    const sources = new Set(
      Object.values(variants).map((v) => v.source).filter(Boolean)
    );
    const source: PriceSource | undefined =
      sources.size === 1 ? ([...sources][0] as PriceSource) : undefined;

    entries[cardId] = {
      usd: rowLevel.usd,
      eur: rowLevel.eur,
      updatedAt,
      ...(source ? { source } : {}),
      variants,
    };
  }

  return entries;
}

export function expandEntryToVariantRows(
  cardId: string,
  entry: PriceEntry,
  catalogueVariants: string[],
  options: { includeOrphans?: boolean; card?: PokemonCard } = {}
): VariantPriceRow[] {
  const rows: VariantPriceRow[] = [];
  const seen = new Set<string>();
  const cardSource = entry.source ?? "pokewallet";

  if (options.card) {
    for (const variant of catalogueVariants) {
      const record = getVariantPriceRecord(options.card, variant, entry);
      if (!record || !variantHasAmount(record)) continue;
      seen.add(variant);
      rows.push(
        variantRowFromRecord(cardId, variant, record, {
          fallbackSource: record.source ?? cardSource,
        })
      );
    }
  } else if (entry.variants) {
    for (const [variant, record] of Object.entries(entry.variants)) {
      if (!catalogueVariants.includes(variant)) continue;
      seen.add(variant);
      rows.push(
        variantRowFromRecord(cardId, variant, record, {
          fallbackSource: record.source ?? cardSource,
        })
      );
    }
  }

  if (entry.variants) {
    for (const [variant, record] of Object.entries(entry.variants)) {
      if (seen.has(variant)) continue;
      const isCatalogue = catalogueVariants.includes(variant);
      if (!isCatalogue && !options.includeOrphans) continue;
      if (isCatalogue) continue;
      rows.push(
        variantRowFromRecord(cardId, variant, record, {
          orphan: true,
          fallbackSource: record.source ?? cardSource,
        })
      );
    }
  }

  if (
    rows.length === 0 &&
    catalogueVariants.length === 1 &&
    (entry.usd != null || entry.eur != null)
  ) {
    rows.push({
      cardId,
      variant: catalogueVariants[0],
      usd: normalizePriceAmount(entry.usd),
      eur: normalizePriceAmount(entry.eur),
      updatedAt: entry.updatedAt,
      source: cardSource,
      priceKind: defaultPriceKindForSource(cardSource),
    });
  }

  return rows;
}

export function mergeVariantRecords(
  fetched: VariantPriceRecord,
  existing: VariantPriceRecord | undefined
): VariantPriceRecord {
  if (existing?.source === "manual") {
    return existing;
  }
  if (!variantHasAmount(fetched) && variantHasAmount(existing)) {
    return existing!;
  }
  return fetched;
}

export function shouldSkipVariantFetch(
  record: VariantPriceRecord | undefined,
  today: string,
  force: boolean
): { skip: boolean; reason?: "manual" | "fresh" } {
  if (record?.source === "manual") {
    return { skip: true, reason: "manual" };
  }
  if (!force && record?.updatedAt && record.updatedAt.slice(0, 10) === today) {
    return { skip: true, reason: "fresh" };
  }
  return { skip: false };
}

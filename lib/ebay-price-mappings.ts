import fs from "node:fs";
import path from "node:path";

export interface EbayPriceMapping {
  cardId: string;
  variant: string;
  marketplaceId: string;
  categoryId?: string;
  queries: string[];
  requiredTerms: string[];
  preferredTerms?: string[];
  excludedTerms?: string[];
  /** Minimum accepted listings after filtering (default 2; never 0 or 1). */
  minSamples?: number;
  maxPages?: number;
  limitPerPage?: number;
  mappingVersion?: string;
  note?: string;
}

export interface EbayPriceMappingsFile {
  version: number;
  mappings: Record<string, EbayPriceMapping>;
}

const DEFAULT_PATH = path.join(process.cwd(), "data", "ebay-price-mappings.json");

export function loadEbayPriceMappings(
  filePath = DEFAULT_PATH
): Record<string, EbayPriceMapping> {
  if (!fs.existsSync(filePath)) return {};
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as EbayPriceMappingsFile;
  if (!raw?.mappings || typeof raw.mappings !== "object") return {};
  return raw.mappings;
}

export function slotKey(cardId: string, variant: string): string {
  return `${cardId}.${variant}`;
}

export function validateEbayMapping(mapping: EbayPriceMapping): string[] {
  const errors: string[] = [];
  if (!mapping.cardId) errors.push("missing cardId");
  if (!mapping.variant) errors.push("missing variant");
  if (!mapping.marketplaceId) errors.push("missing marketplaceId");
  if (!Array.isArray(mapping.queries) || mapping.queries.length === 0) {
    errors.push("queries must be a non-empty array");
  }
  if (!Array.isArray(mapping.requiredTerms) || mapping.requiredTerms.length === 0) {
    errors.push("requiredTerms must be a non-empty array");
  }
  return errors;
}

export function getEbayMappingForSlot(
  cardId: string,
  variant: string,
  mappings = loadEbayPriceMappings()
): EbayPriceMapping | undefined {
  return mappings[slotKey(cardId, variant)];
}

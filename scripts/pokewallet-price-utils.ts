/**
 * Map Pokewallet card payloads to our prices.json PriceEntry format.
 */

import type { PokemonCard } from "../types";
import type {
  PokewalletCardResult,
  PokewalletCmPrice,
  PokewalletSetSummary,
  PokewalletTcgPrice,
} from "./pokewallet-client";
import { normalizePriceAmount } from "../lib/parse-price";
import type { SetLookupHint } from "./pokewallet-set-map";
import { OUR_SET_TO_POKEWALLET } from "./pokewallet-set-map";

export interface PriceEntry {
  usd?: number | null;
  eur?: number | null;
  updatedAt: string;
  variants?: Record<string, { usd?: number | null; eur?: number | null }>;
}

export interface PokewalletIdCacheEntry {
  pokewalletId: string;
  setCode: string;
  resolvedAt: string;
  matchScore?: number;
  searchQuery?: string;
  /** Curated per-catalogue-variant Pokewallet IDs (separate card records). */
  variants?: Record<string, PokewalletVariantIdCacheEntry>;
}

/** Variant slot entry — no nested `variants` map. */
export type PokewalletVariantIdCacheEntry = Omit<
  PokewalletIdCacheEntry,
  "variants"
>;

export type PokewalletIdCache = Record<string, PokewalletIdCacheEntry>;

export interface SetIndexEntry {
  setId: string;
  setCode: string | null;
  name: string;
  language: string | null;
}

export interface SetIndex {
  byOurSetId: Map<string, SetIndexEntry>;
  bySetName: Map<string, SetIndexEntry[]>;
}

const MATCH_THRESHOLD = 50;

const TCG_SUBTYPE_TO_VARIANT: Record<string, string> = {
  normal: "normal",
  unlimited: "normal",
  holofoil: "holo",
  "unlimited holofoil": "holo",
  "reverse holofoil": "reverse",
  "1st edition": "firstEdition",
  "1st edition holofoil": "firstEdition",
  shadowless: "normal",
};

const CM_VARIANT_TO_OUR: Record<string, string> = {
  normal: "normal",
  holo: "holo",
  reverse: "reverse",
  "reverse holo": "reverse",
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalize card numbers for comparison (148/165 -> 148, 013 -> 13, GG35 -> gg35). */
export function normalizeCardNumber(num: string): string {
  const raw = (num ?? "").trim();
  const slash = raw.indexOf("/");
  const base = slash >= 0 ? raw.slice(0, slash) : raw;
  if (/^\d+$/.test(base)) {
    return String(parseInt(base, 10));
  }
  return base.toLowerCase();
}

function tcgUsd(price: PokewalletTcgPrice): number | null {
  const v =
    price.market_price ??
    price.mid_price ??
    price.low_price ??
    price.high_price ??
    null;
  return normalizePriceAmount(v);
}

function cmEur(price: PokewalletCmPrice): number | null {
  const v = price.avg ?? price.trend ?? price.avg7 ?? price.avg30 ?? price.low ?? null;
  return normalizePriceAmount(v);
}

function mapTcgVariant(subType: string | undefined): string {
  if (!subType) return "normal";
  const key = subType.toLowerCase().trim();
  return TCG_SUBTYPE_TO_VARIANT[key] ?? "normal";
}

function mapCmVariant(variantType: string | undefined): string {
  if (!variantType) return "normal";
  return CM_VARIANT_TO_OUR[variantType.toLowerCase()] ?? "normal";
}

function extractVariantPrices(result: PokewalletCardResult): Record<
  string,
  { usd: number | null; eur: number | null }
> {
  const out: Record<string, { usd: number | null; eur: number | null }> = {};

  for (const p of result.tcgplayer?.prices ?? []) {
    const variant = mapTcgVariant(p.sub_type_name);
    const usd = tcgUsd(p);
    if (usd === null) continue;
    const existing = out[variant] ?? { usd: null, eur: null };
    if (existing.usd === null) existing.usd = usd;
    out[variant] = existing;
  }

  for (const p of result.cardmarket?.prices ?? []) {
    const variant = mapCmVariant(p.variant_type);
    const eur = cmEur(p);
    if (eur === null) continue;
    const existing = out[variant] ?? { usd: null, eur: null };
    existing.eur = eur;
    out[variant] = existing;
  }

  return out;
}

function bestCardLevelUsd(
  variants: Record<string, { usd: number | null; eur: number | null }>
): number | null {
  const order = ["normal", "reverse", "holo", "firstEdition"];
  for (const v of order) {
    const price = normalizePriceAmount(variants[v]?.usd);
    if (price != null) return price;
  }
  for (const v of Object.values(variants)) {
    const price = normalizePriceAmount(v.usd);
    if (price != null) return price;
  }
  return null;
}

function bestCardLevelEur(
  variants: Record<string, { usd: number | null; eur: number | null }>
): number | null {
  const order = ["normal", "holo", "reverse", "firstEdition"];
  for (const v of order) {
    const price = normalizePriceAmount(variants[v]?.eur);
    if (price != null) return price;
  }
  for (const v of Object.values(variants)) {
    const price = normalizePriceAmount(v.eur);
    if (price != null) return price;
  }
  return null;
}

export function pokewalletResultToPriceEntry(
  result: PokewalletCardResult,
  updatedAt: string
): PriceEntry | null {
  const variantMap = extractVariantPrices(result);
  const usd = bestCardLevelUsd(variantMap);
  const eur = bestCardLevelEur(variantMap);
  if (usd === null && eur === null) return null;

  const entry: PriceEntry = { usd, eur, updatedAt };
  if (Object.keys(variantMap).length > 0) {
    entry.variants = variantMap;
  }
  return entry;
}

/** Map one Pokewallet card response onto an explicit catalogue variant key. */
export function pokewalletResultToCatalogueVariantPrice(
  result: PokewalletCardResult,
  catalogueVariant: string,
  updatedAt: string
): PriceEntry | null {
  const variantMap = extractVariantPrices(result);
  const usd = bestCardLevelUsd(variantMap);
  const eur = bestCardLevelEur(variantMap);
  if (usd === null && eur === null) return null;

  return {
    usd,
    eur,
    updatedAt,
    variants: {
      [catalogueVariant]: { usd, eur },
    },
  };
}

export function mergeCatalogueVariantPriceEntries(
  parts: Array<PriceEntry | null>,
  updatedAt: string
): PriceEntry | null {
  const variants: Record<string, { usd: number | null; eur: number | null }> =
    {};

  for (const part of parts) {
    if (!part?.variants) continue;
    for (const [key, prices] of Object.entries(part.variants)) {
      variants[key] = {
        usd: prices.usd ?? null,
        eur: prices.eur ?? null,
      };
    }
  }

  if (Object.keys(variants).length === 0) return null;

  return {
    usd: bestCardLevelUsd(variants),
    eur: bestCardLevelEur(variants),
    updatedAt,
    variants,
  };
}

export function hasCachedPokewalletId(
  entry: PokewalletIdCacheEntry | undefined
): boolean {
  if (!entry) return false;
  if (entry.pokewalletId) return true;
  return Boolean(entry.variants && Object.keys(entry.variants).length > 0);
}

export interface VariantFetchTarget {
  catalogueVariant: string;
  entry: PokewalletVariantIdCacheEntry;
}

/** When `variants` is set, fetch one Pokewallet card per catalogue variant. */
export function listVariantFetchTargets(
  cacheEntry: PokewalletIdCacheEntry
): VariantFetchTarget[] {
  const variantEntries = cacheEntry.variants;
  if (variantEntries && Object.keys(variantEntries).length > 0) {
    return Object.entries(variantEntries).map(([catalogueVariant, entry]) => ({
      catalogueVariant,
      entry,
    }));
  }

  return [
    {
      catalogueVariant: "__default__",
      entry: {
        pokewalletId: cacheEntry.pokewalletId,
        setCode: cacheEntry.setCode,
        resolvedAt: cacheEntry.resolvedAt,
        matchScore: cacheEntry.matchScore,
        searchQuery: cacheEntry.searchQuery,
      },
    },
  ];
}

export function preserveCuratedVariantIds(
  incoming: PokewalletIdCacheEntry,
  existing: PokewalletIdCacheEntry | undefined
): PokewalletIdCacheEntry {
  if (!existing?.variants || Object.keys(existing.variants).length === 0) {
    return incoming;
  }
  return { ...incoming, variants: existing.variants };
}

export function peekPrices(result: PokewalletCardResult): {
  usd: number | null;
  eur: number | null;
} {
  const entry = pokewalletResultToPriceEntry(result, "");
  return { usd: entry?.usd ?? null, eur: entry?.eur ?? null };
}

function nameScore(ourName: string, theirName: string): number {
  const a = normalizeName(ourName);
  const b = normalizeName(theirName);
  if (a === b) return 100;
  if (b.startsWith(a) || a.startsWith(b)) return 80;
  if (b.includes(a) || a.includes(b)) return 60;
  return 0;
}

function variantAlignmentScore(
  card: PokemonCard,
  result: PokewalletCardResult
): number {
  const ours = new Set(card.variants ?? ["normal"]);
  const theirs = new Set<string>();
  for (const p of result.tcgplayer?.prices ?? []) {
    theirs.add(mapTcgVariant(p.sub_type_name));
  }
  for (const p of result.cardmarket?.prices ?? []) {
    theirs.add(mapCmVariant(p.variant_type));
  }
  if (theirs.size === 0) return 5;
  let overlap = 0;
  for (const v of ours) {
    if (theirs.has(v)) overlap++;
  }
  return overlap * 10;
}

export function scorePokewalletMatch(
  card: PokemonCard,
  result: PokewalletCardResult
): number {
  const ourNum = normalizeCardNumber(searchNumberForCard(card));
  const theirNum = normalizeCardNumber(result.card_info.card_number ?? "");
  if (ourNum !== theirNum) return 0;

  let score = 50 + nameScore(card.name, result.card_info.name ?? "");
  score += variantAlignmentScore(card, result);

  const setName = card.set.name.toLowerCase();
  const theirSet = (result.card_info.set_name ?? "").toLowerCase();
  if (setName && theirSet && (theirSet.includes(setName) || setName.includes(theirSet))) {
    score += 15;
  }

  return score;
}

export function findBestPokewalletMatch(
  card: PokemonCard,
  candidates: PokewalletCardResult[]
): { result: PokewalletCardResult; score: number } | null {
  let best: PokewalletCardResult | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = scorePokewalletMatch(card, c);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best || bestScore < MATCH_THRESHOLD) return null;
  return { result: best, score: bestScore };
}

export function resolveSetHint(
  ourSetId: string,
  ourSetName: string,
  allSets: PokewalletSetSummary[],
  catalogueLanguage?: PokemonCard["catalogueLanguage"]
): SetLookupHint | null {
  const curated = OUR_SET_TO_POKEWALLET[ourSetId];
  if (curated) return curated;

  const desiredLang =
    catalogueLanguage === "ja"
      ? "jpn"
      : catalogueLanguage === "zh-cn"
        ? "chn"
        : catalogueLanguage === "en"
          ? "eng"
          : undefined;

  const idUpper = ourSetId.toUpperCase();
  const byCode = allSets.filter(
    (s) => s.set_code?.toUpperCase() === idUpper || s.set_id === ourSetId
  );
  const byCodePick =
    (desiredLang ? byCode.find((s) => s.language === desiredLang) : undefined) ??
    byCode.find((s) => s.language === "eng") ??
    byCode[0];
  if (byCodePick) {
    return {
      pokewalletSetCode: byCodePick.set_id,
      language: byCodePick.language === "eng" ? "eng" : byCodePick.language ?? undefined,
    };
  }

  const target = normalizeSetName(ourSetName);
  const nameMatches = allSets.filter(
    (s) =>
      normalizeSetName(s.name) === target ||
      normalizeSetName(s.name).includes(target) ||
      target.includes(normalizeSetName(s.name))
  );

  const pick =
    (desiredLang ? nameMatches.find((s) => s.language === desiredLang) : undefined) ??
    nameMatches.find((s) => s.language === "eng") ??
    nameMatches.sort((a, b) => b.card_count - a.card_count)[0];

  if (pick) {
    return {
      pokewalletSetCode: pick.set_id,
      language: pick.language === "eng" ? "eng" : pick.language ?? undefined,
    };
  }

  return null;
}

export function buildSetIndex(allSets: PokewalletSetSummary[]): SetIndex {
  const byOurSetId = new Map<string, SetIndexEntry>();
  const bySetName = new Map<string, SetIndexEntry[]>();

  for (const s of allSets) {
    const entry: SetIndexEntry = {
      setId: s.set_id,
      setCode: s.set_code,
      name: s.name,
      language: s.language,
    };
    const norm = normalizeSetName(s.name);
    const list = bySetName.get(norm) ?? [];
    list.push(entry);
    bySetName.set(norm, list);
  }

  return { byOurSetId, bySetName };
}

export function lookupSetForCard(
  card: PokemonCard,
  allSets: PokewalletSetSummary[]
): SetIndexEntry | null {
  const hint = resolveSetHint(
    card.set.id,
    card.set.name,
    allSets,
    card.catalogueLanguage
  );
  if (!hint) return null;

  const byId = allSets.find((s) => s.set_id === hint.pokewalletSetCode);
  if (byId) {
    return {
      setId: byId.set_id,
      setCode: byId.set_code,
      name: byId.name,
      language: byId.language,
    };
  }

  const byCode = allSets.find(
    (s) => s.set_code?.toUpperCase() === hint.pokewalletSetCode.toUpperCase()
  );
  if (byCode) {
    return {
      setId: byCode.set_id,
      setCode: byCode.set_code,
      name: byCode.name,
      language: byCode.language,
    };
  }

  return {
    setId: hint.pokewalletSetCode,
    setCode: hint.pokewalletSetCode,
    name: card.set.name,
    language: hint.language ?? null,
  };
}

export function searchNumberForCard(card: PokemonCard): string {
  if (card.id.startsWith("cbb2c-")) {
    return card.id.slice("cbb2c-".length);
  }
  if (card.id.startsWith("cs6bc-")) {
    return card.id.slice("cs6bc-".length);
  }
  const raw = card.number.trim();
  if (raw.includes(" ") && /^\d+\s+\d+\/\d+$/.test(raw)) {
    return raw.split(/\s+/)[0].replace(/^0+/, "") || raw;
  }
  return raw;
}

export function buildSearchQueries(
  card: PokemonCard,
  allSets: PokewalletSetSummary[]
): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  function add(q: string) {
    const t = q.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    queries.push(t);
  }

  const setEntry = lookupSetForCard(card, allSets);
  const num = searchNumberForCard(card);

  // Name-first queries tend to be most accurate on Pokewallet /search
  add(`${card.name} ${card.set.name} ${num}`);
  add(`${card.name} ${num}`);

  if (card.set.id === "cbb2c" || card.id.startsWith("cbb2c-")) {
    const cbbNum = card.id.startsWith("cbb2c-")
      ? card.id.slice("cbb2c-".length)
      : num;
    add(`${card.name} CBB2C ${cbbNum}`);
    add(`CBB2C ${cbbNum}`);
  }

  if (card.set.id === "cs6bc" || card.id.startsWith("cs6bc-")) {
    const csNum = card.id.startsWith("cs6bc-")
      ? card.id.slice("cs6bc-".length)
      : num;
    add(`${card.name} CBB5C ${csNum}`);
    add(`CBB5C ${csNum}`);
  }

  if (setEntry) {
    if (setEntry.setCode) add(`${setEntry.setCode} ${num}`);
    add(`${setEntry.setId} ${num}`);
  }

  const curated = OUR_SET_TO_POKEWALLET[card.set.id];
  if (curated && curated.pokewalletSetCode !== setEntry?.setId) {
    add(`${curated.pokewalletSetCode} ${num}`);
  }

  return queries;
}

export function cacheEntryFromResult(
  result: PokewalletCardResult,
  setCode: string,
  resolvedAt: string,
  matchScore?: number,
  searchQuery?: string
): PokewalletIdCacheEntry {
  return {
    pokewalletId: result.id,
    setCode: result.card_info.set_code ?? setCode,
    resolvedAt,
    ...(matchScore !== undefined ? { matchScore } : {}),
    ...(searchQuery ? { searchQuery } : {}),
  };
}

export interface ResolveIdResult {
  entry: PokewalletIdCacheEntry;
  result: PokewalletCardResult;
  query: string;
  score: number;
}

export async function resolvePokewalletIdViaSearch(
  card: PokemonCard,
  allSets: PokewalletSetSummary[],
  searchFn: (query: string) => Promise<PokewalletCardResult[]>,
  resolvedAt: string
): Promise<ResolveIdResult | null> {
  const queries = buildSearchQueries(card, allSets);
  let bestOverall: ResolveIdResult | null = null;

  for (const query of queries) {
    const results = await searchFn(query);
    const match = findBestPokewalletMatch(card, results);
    if (!match) continue;
    if (!bestOverall || match.score > bestOverall.score) {
      bestOverall = {
        entry: cacheEntryFromResult(
          match.result,
          match.result.card_info.set_code ?? card.set.id,
          resolvedAt,
          match.score,
          query
        ),
        result: match.result,
        query,
        score: match.score,
      };
    }
    if (match.score >= 90) break;
  }

  return bestOverall;
}

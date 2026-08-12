import fs from "node:fs";
import path from "node:path";
import type { PokemonCard } from "../types";
import {
  buildCardMatchIndex,
  matchExternalEntryToCards,
  type CardMatchKey,
} from "./card-match";
import { mergeVariantLists } from "./merge-variants";
import { isMasterSetCatalogueCard } from "./master-set-extras";
import {
  classifyExternalVariantLabel,
  registerExternalVariantLabel,
} from "./variant-labels";

export interface ExternalCatalogEntry extends CardMatchKey {
  variantLabel: string | null;
  sourceFile: string;
}

export interface ExternalVariantMergeResult {
  /** Explicit external variant keys per matched card (for reporting). */
  variantsByCardId: Map<string, string[]>;
  /** Ambiguous Unlimited/null keys per matched card (applied only when the card has no originals). */
  ambiguousByCardId: Map<string, string[]>;
  unmatched: ExternalCatalogEntry[];
  duplicateSkips: number;
}

interface ExternalJsonFile {
  entries?: Array<{
    name: string;
    setName: string;
    number: string;
    variant: string | null;
  }>;
}

function dedupeKey(entry: ExternalCatalogEntry, variantKey: string): string {
  return [
    entry.name,
    entry.setName,
    entry.number,
    variantKey,
  ]
    .join("|")
    .toLowerCase();
}

export function loadExternalCatalogEntries(dataDir = path.join(process.cwd(), "data")): ExternalCatalogEntry[] {
  const files = fs
    .readdirSync(dataDir)
    .filter((name) => name.endsWith("External.json"))
    .sort();

  const entries: ExternalCatalogEntry[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dataDir, file), "utf8");
    const parsed = JSON.parse(raw) as ExternalJsonFile;
    for (const row of parsed.entries ?? []) {
      entries.push({
        name: row.name,
        setName: row.setName,
        number: row.number,
        variantLabel: row.variant,
        sourceFile: file,
      });
    }
  }

  return entries;
}

function bucketSetsToLists(
  explicitSets: Map<string, Set<string>>,
  ambiguousSets: Map<string, Set<string>>
): Pick<ExternalVariantMergeResult, "variantsByCardId" | "ambiguousByCardId"> {
  const variantsByCardId = new Map<string, string[]>();
  const ambiguousByCardId = new Map<string, string[]>();

  const allCardIds = new Set([...explicitSets.keys(), ...ambiguousSets.keys()]);
  for (const cardId of allCardIds) {
    const explicit = explicitSets.get(cardId);
    if (explicit?.size) {
      variantsByCardId.set(cardId, mergeVariantLists([...explicit]));
    }
    const ambiguous = ambiguousSets.get(cardId);
    if (ambiguous?.size) {
      ambiguousByCardId.set(cardId, mergeVariantLists([...ambiguous]));
    }
  }

  return { variantsByCardId, ambiguousByCardId };
}

/** Union original catalogue keys with explicit external keys; ambiguous keys only when no originals exist. */
export function mergeExternalVariantsOntoCard(
  card: PokemonCard,
  explicitKeys: string[] | undefined,
  ambiguousKeys: string[] | undefined
): string[] {
  const originals = card.variants?.length ? card.variants : [];
  let merged = mergeVariantLists(originals, explicitKeys);

  if (originals.length === 0) {
    merged = mergeVariantLists(merged, ambiguousKeys);
  }

  if (merged.length === 0) {
    merged = ["normal"];
  }

  return merged;
}

export function buildExternalVariantsByCardId(
  cards: PokemonCard[],
  catalogEntries = loadExternalCatalogEntries()
): ExternalVariantMergeResult {
  const index = buildCardMatchIndex(cards);
  const explicitSets = new Map<string, Set<string>>();
  const ambiguousSets = new Map<string, Set<string>>();
  const unmatched: ExternalCatalogEntry[] = [];
  const seen = new Set<string>();
  let duplicateSkips = 0;

  for (const entry of catalogEntries) {
    const { key: variantKey, kind } = classifyExternalVariantLabel(entry.variantLabel);
    registerExternalVariantLabel(variantKey, entry.variantLabel);

    const dedupe = dedupeKey(entry, variantKey);
    if (seen.has(dedupe)) {
      duplicateSkips++;
      continue;
    }
    seen.add(dedupe);

    const matched = matchExternalEntryToCards(entry, index);
    if (matched.length === 0) {
      unmatched.push(entry);
      continue;
    }

    for (const card of matched) {
      const buckets = kind === "explicit" ? explicitSets : ambiguousSets;
      const bucket = buckets.get(card.id) ?? new Set<string>();
      bucket.add(variantKey);
      buckets.set(card.id, bucket);
    }
  }

  const { variantsByCardId, ambiguousByCardId } = bucketSetsToLists(explicitSets, ambiguousSets);
  return { variantsByCardId, ambiguousByCardId, unmatched, duplicateSkips };
}

export function applyExternalVariantsToCards(
  cards: PokemonCard[],
  catalogEntries?: ExternalCatalogEntry[]
): { cards: PokemonCard[]; report: ExternalVariantMergeResult } {
  const report = buildExternalVariantsByCardId(cards, catalogEntries);

  const next = cards.map((card) => {
    const explicitKeys = report.variantsByCardId.get(card.id);
    const ambiguousKeys = report.ambiguousByCardId.get(card.id);
    if (!explicitKeys?.length && !ambiguousKeys?.length) return card;
    return {
      ...card,
      variants: mergeExternalVariantsOntoCard(card, explicitKeys, ambiguousKeys),
    };
  });

  return { cards: next, report };
}

function ensureAtLeastNormal(card: PokemonCard): PokemonCard {
  if (card.variants?.length) return card;
  return { ...card, variants: ["normal"] };
}

/** Drop variant slots on catalogue cards outside the master set (after manual merge). */
export function finalizeMasterSetCatalog(
  cards: PokemonCard[],
  report: ExternalVariantMergeResult,
  manualCatalogueIds: ReadonlySet<string> = new Set()
): PokemonCard[] {
  const externalIds = new Set([
    ...report.variantsByCardId.keys(),
    ...report.ambiguousByCardId.keys(),
  ]);
  return cards.map((card) => {
    if (
      externalIds.has(card.id) ||
      isMasterSetCatalogueCard(card.id, externalIds) ||
      manualCatalogueIds.has(card.id)
    ) {
      return ensureAtLeastNormal(card);
    }
    if (!card.variants?.length) return card;
    return { ...card, variants: [] };
  });
}

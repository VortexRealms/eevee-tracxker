/**
 * Eeveelution cameo card catalogue: one physical printing, many related Pokémon.
 */

import cameoData from "../data/cameo-cards.json";
import type { PokemonCard, PokemonName } from "../types";
import { EEVEELUTIONS } from "./collection-filters";

export type CameoLanguage = "en" | "ja" | "zh-cn";
export type CameoResolutionStatus =
  | "resolved"
  | "catalogue-existing"
  | "manual"
  | "ambiguous";

export interface CameoCardEntry {
  /** Stable dedupe key: language|set|number|cardName */
  key: string;
  cardName: string;
  setName: string;
  number: string;
  language: CameoLanguage;
  cameoOf: PokemonName[];
  notes?: string;
  /** Pokémon TCG API / tracker catalogue id when known */
  catalogueId?: string;
  resolution: CameoResolutionStatus;
  /** How to ingest: tcgdx-included | manual-only */
  ingest?: "tcgdx-included" | "manual-only";
}

export interface CameoCardsFile {
  version: number;
  updatedAt: string;
  entries: CameoCardEntry[];
}

const VALID_CAMEO: ReadonlySet<PokemonName> = new Set([
  "Eevee",
  "Vaporeon",
  "Jolteon",
  "Flareon",
  "Espeon",
  "Umbreon",
  "Leafeon",
  "Glaceon",
  "Sylveon",
]);

export function loadCameoCatalogue(): CameoCardsFile {
  return cameoData as CameoCardsFile;
}

export function physicalKey(
  language: string,
  setName: string,
  number: string,
  cardName: string
): string {
  return `${language}|${setName.trim().toLowerCase()}|${number.trim().toLowerCase()}|${cardName.trim().toLowerCase()}`;
}

export function validateCameoEntry(entry: CameoCardEntry): string[] {
  const errors: string[] = [];
  if (!entry.key) errors.push("missing key");
  if (!entry.cardName) errors.push("missing cardName");
  if (!entry.setName) errors.push("missing setName");
  if (!entry.number && entry.resolution !== "ambiguous") {
    errors.push("missing number");
  }
  if (!entry.cameoOf?.length) errors.push("empty cameoOf");
  for (const name of entry.cameoOf ?? []) {
    if (!VALID_CAMEO.has(name as PokemonName)) {
      errors.push(`invalid cameoOf: ${name}`);
    }
  }
  return errors;
}

export function validateCameoCatalogue(file: CameoCardsFile): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  const catalogueIds = new Map<string, string>();

  for (const entry of file.entries) {
    const entryErrors = validateCameoEntry(entry);
    errors.push(...entryErrors.map((e) => `${entry.key}: ${e}`));

    if (keys.has(entry.key)) {
      errors.push(`duplicate key: ${entry.key}`);
    }
    keys.add(entry.key);

    if (entry.catalogueId) {
      const prev = catalogueIds.get(entry.catalogueId);
      if (prev && prev !== entry.key) {
        errors.push(
          `duplicate catalogueId ${entry.catalogueId}: ${prev} vs ${entry.key}`
        );
      }
      catalogueIds.set(entry.catalogueId, entry.key);
    }
  }

  return errors;
}

/** Map catalogue id → aggregated cameo relationships. */
export function cameoOfByCatalogueId(
  file: CameoCardsFile = loadCameoCatalogue()
): Map<string, PokemonName[]> {
  const out = new Map<string, Set<PokemonName>>();

  for (const entry of file.entries) {
    if (!entry.catalogueId) continue;
    const set = out.get(entry.catalogueId) ?? new Set<PokemonName>();
    for (const name of entry.cameoOf) {
      set.add(name);
    }
    out.set(entry.catalogueId, set);
  }

  const merged = new Map<string, PokemonName[]>();
  for (const [id, names] of out) {
    merged.set(id, sortCameoNames([...names]));
  }
  return merged;
}

export function applyCameoMetadata(cards: PokemonCard[]): PokemonCard[] {
  const byId = cameoOfByCatalogueId();
  return cards.map((card) => {
    const cameoOf = byId.get(card.id);
    if (!cameoOf?.length) return card;
    return { ...card, cameoOf };
  });
}

export function cameoMasterSetIds(
  file: CameoCardsFile = loadCameoCatalogue()
): Set<string> {
  const ids = new Set<string>();
  for (const entry of file.entries) {
    if (entry.catalogueId && entry.resolution !== "ambiguous") {
      ids.add(entry.catalogueId);
    }
  }
  return ids;
}

export function formatCameoLabel(cameoOf: PokemonName[] | undefined): string | null {
  if (!cameoOf?.length) return null;
  return sortCameoNames(cameoOf).join(", ");
}

function sortCameoNames(names: PokemonName[]): PokemonName[] {
  const order = new Map(EEVEELUTIONS.map((name, index) => [name, index]));
  return [...names].sort(
    (a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99) || a.localeCompare(b)
  );
}

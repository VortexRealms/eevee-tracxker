import type { PokemonCard, PokemonName } from "../types";

export const EEVEELUTIONS: readonly PokemonName[] = [
  "Eevee",
  "Vaporeon",
  "Jolteon",
  "Flareon",
  "Espeon",
  "Umbreon",
  "Leafeon",
  "Glaceon",
  "Sylveon",
] as const;

export type EeveelutionFilter = PokemonName | "all";

const PRIMARY_MATCH_ORDER: readonly PokemonName[] = [...EEVEELUTIONS].sort(
  (a, b) => b.length - a.length
);

export function isCameoCard(card: Pick<PokemonCard, "cameoOf">): boolean {
  return Boolean(card.cameoOf?.length);
}

export function primaryEeveelution(
  card: Pick<PokemonCard, "name">
): PokemonName | null {
  const name = card.name ?? "";
  for (const species of PRIMARY_MATCH_ORDER) {
    const pattern = new RegExp(`\\b${species}\\b`, "i");
    if (pattern.test(name)) return species;
  }
  return null;
}

export function matchesEeveelutionFilter(
  card: Pick<PokemonCard, "name" | "cameoOf">,
  selected: EeveelutionFilter,
  includeCameos: boolean
): boolean {
  const cameo = isCameoCard(card);
  const primary = primaryEeveelution(card);

  if (selected === "all") {
    return includeCameos || !cameo;
  }

  const primaryHit = primary === selected;
  const cameoHit = cameo && Boolean(card.cameoOf?.includes(selected));

  if (!includeCameos) {
    return !cameo && primaryHit;
  }

  return primaryHit || cameoHit;
}

export function matchesSetFilter(
  card: Pick<PokemonCard, "set">,
  selectedSet: string | "all"
): boolean {
  if (selectedSet === "all") return true;
  return card.set.name === selectedSet;
}

export interface CollectionSetOption {
  name: string;
  releaseDate: string;
}

export function uniqueSetsFromCards(
  cards: Pick<PokemonCard, "set">[]
): CollectionSetOption[] {
  const byName = new Map<string, string>();
  for (const card of cards) {
    const name = card.set.name;
    const date = card.set.releaseDate ?? "";
    const existing = byName.get(name);
    if (existing == null || (date && (!existing || date < existing))) {
      byName.set(name, date);
    }
  }

  return [...byName.entries()]
    .map(([name, releaseDate]) => ({ name, releaseDate }))
    .sort((a, b) => {
      if (a.releaseDate !== b.releaseDate) {
        return a.releaseDate.localeCompare(b.releaseDate);
      }
      return a.name.localeCompare(b.name);
    });
}

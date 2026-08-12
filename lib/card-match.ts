import type { PokemonCard } from "../types";
import { EXTERNAL_SET_NAME_ALIASES } from "./set-name-aliases";

export function normalizeSetName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize card numbers for comparison (148/165 -> 148, 013 -> 13, H09 -> h9, GG35 -> gg35). */
export function normalizeCardNumber(num: string): string {
  const raw = (num ?? "").trim();
  const slash = raw.indexOf("/");
  const base = slash >= 0 ? raw.slice(0, slash) : raw;

  if (/^\d+$/.test(base)) {
    return String(parseInt(base, 10));
  }

  const holoRare = /^h0*(\d+)([a-z]*)$/i.exec(base);
  if (holoRare) {
    return `h${parseInt(holoRare[1], 10)}${holoRare[2].toLowerCase()}`;
  }

  const numericSuffix = /^(\d+)([a-z]+)$/i.exec(base);
  if (numericSuffix) {
    return `${parseInt(numericSuffix[1], 10)}${numericSuffix[2].toLowerCase()}`;
  }

  return base.toLowerCase();
}

export function normalizePokemonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveExternalSetName(externalSetName: string): string {
  const normalized = normalizeSetName(externalSetName);
  return EXTERNAL_SET_NAME_ALIASES[normalized] ?? externalSetName.trim();
}

export interface CardMatchKey {
  name: string;
  setName: string;
  number: string;
}

function matchKeyParts(key: CardMatchKey): string {
  return [
    normalizePokemonName(key.name),
    normalizeSetName(resolveExternalSetName(key.setName)),
    normalizeCardNumber(key.number),
  ].join("|");
}

export function buildCardMatchIndex(cards: PokemonCard[]): Map<string, PokemonCard[]> {
  const index = new Map<string, PokemonCard[]>();

  for (const card of cards) {
    const key = matchKeyParts({
      name: card.name,
      setName: card.set.name,
      number: card.number,
    });
    const bucket = index.get(key);
    if (bucket) bucket.push(card);
    else index.set(key, [card]);
  }

  return index;
}

export function matchExternalEntryToCards(
  entry: CardMatchKey,
  index: Map<string, PokemonCard[]>
): PokemonCard[] {
  const resolvedSetName = resolveExternalSetName(entry.setName);
  const key = matchKeyParts({
    name: entry.name,
    setName: resolvedSetName,
    number: entry.number,
  });

  const direct = index.get(key);
  if (direct?.length) return direct;

  const fuzzyKey = matchKeyParts({
    name: entry.name,
    setName: entry.setName,
    number: entry.number,
  });
  const fuzzy = index.get(fuzzyKey);
  if (fuzzy?.length) return fuzzy;

  const entryName = normalizePokemonName(entry.name);
  const entryNumber = normalizeCardNumber(entry.number);
  const byNumber = [...index.entries()].filter(([indexKey]) => {
    const parts = indexKey.split("|");
    const indexNumber = parts[2];
    if (parts[1] !== normalizeSetName(resolvedSetName)) return false;
    if (indexNumber === entryNumber) return true;
    // 92a external ↔ 92 catalogue when letter suffix differs
    const entryBase = entryNumber.replace(/[a-z]+$/, "");
    const indexBase = indexNumber.replace(/[a-z]+$/, "");
    return entryBase === indexBase && /[a-z]$/.test(entryNumber);
  });

  if (byNumber.length === 1) {
    return byNumber[0][1];
  }

  if (byNumber.length > 1) {
    const nameMatches = byNumber.filter(([indexKey]) => {
      const cardName = indexKey.split("|")[0];
      return cardName === entryName || cardName.includes(entryName) || entryName.includes(cardName);
    });
    if (nameMatches.length === 1) {
      return nameMatches[0][1];
    }
  }

  return [];
}

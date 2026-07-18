/**
 * Shared TCGdex fetch helpers for fetch-cards.ts and pick-included-cards.ts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import TCGdex from "@tcgdex/sdk";
import type { PokemonCard } from "../types";
import { normalizeCardId, toTcgdexCardId } from "./set-id-map";

export const tcgdex = new TCGdex("en");

export interface IncludedCardRef {
  id?: string;
  name?: string;
  setId?: string;
  number?: string;
}

export interface CardBrief {
  id: string;
  name: string;
}

const VARIANT_ORDER = ["normal", "reverse", "holo", "firstEdition", "wPromo"] as const;

const setCache = new Map<string, { serieName: string; releaseDate: string }>();

function normalizeStage(stage: string): string {
  return stage.replace(/^Stage(\d)$/, "Stage $1");
}

function buildSubtypes(
  stage: string | undefined,
  suffix: string | undefined
): string[] | undefined {
  const parts: string[] = [];
  if (stage) parts.push(normalizeStage(stage));
  if (suffix) parts.push(suffix);
  return parts.length > 0 ? parts : undefined;
}

function buildVariants(variants: Record<string, boolean> | undefined): string[] {
  if (!variants || typeof variants !== "object") return ["normal"];
  return VARIANT_ORDER.filter((k) => variants[k] === true);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function getSetMeta(
  setId: string
): Promise<{ serieName: string; releaseDate: string }> {
  if (setCache.has(setId)) return setCache.get(setId)!;

  const set = await tcgdex.set.get(setId);
  const meta = {
    serieName: (set as { serie?: { name?: string } })?.serie?.name ?? setId,
    releaseDate: (set as { releaseDate?: string })?.releaseDate ?? "",
  };
  setCache.set(setId, meta);
  return meta;
}

export function isPocketSet(serieName: string): boolean {
  return serieName === "Pokémon TCG Pocket";
}

export function resolveIncludedToPtcgId(ref: IncludedCardRef): string {
  if (ref.id) return ref.id;
  if (ref.setId && ref.number) return `${ref.setId}-${ref.number}`;
  throw new Error(
    `Included card ref must have "id" or both "setId" and "number": ${JSON.stringify(ref)}`
  );
}

export function resolveIncludedToTcgdexId(ref: IncludedCardRef): string {
  return toTcgdexCardId(resolveIncludedToPtcgId(ref));
}

export function includedRefToEntry(
  ref: IncludedCardRef,
  card?: { name: string; set: { name: string } }
): IncludedCardRef & { id: string } {
  const id = resolveIncludedToPtcgId(ref);
  const setId = ref.setId ?? id.substring(0, id.lastIndexOf("-"));
  const number = ref.number ?? id.substring(id.lastIndexOf("-") + 1);
  return {
    id,
    name: ref.name ?? card?.name,
    setId,
    number,
  };
}

export async function loadIncludedCardRefs(
  filePath?: string
): Promise<IncludedCardRef[]> {
  const includedPath =
    filePath ?? path.join(process.cwd(), "data", "included-cards.json");
  try {
    const raw = await fs.readFile(includedPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("included-cards.json must be a JSON array");
    }
    return parsed as IncludedCardRef[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function saveIncludedCardRefs(
  refs: IncludedCardRef[],
  filePath?: string
): Promise<void> {
  const includedPath =
    filePath ?? path.join(process.cwd(), "data", "included-cards.json");
  await fs.writeFile(includedPath, JSON.stringify(refs, null, 2) + "\n", "utf8");
}

type TcgdexCard = {
  id: string;
  name: string;
  rarity?: string;
  category: string;
  types?: string[];
  hp?: number | null;
  image?: string;
  set: { id: string; name: string };
  stage?: string;
  suffix?: string;
  variants?: Record<string, boolean>;
};

export async function mapTcgdexCardToPokemon(
  card: TcgdexCard
): Promise<PokemonCard | null> {
  const normalizedId = normalizeCardId(card.id);
  const setMeta = await getSetMeta(card.set.id);

  if (isPocketSet(setMeta.serieName)) return null;

  const releaseDate = setMeta.releaseDate.replace(/-/g, "/");
  const images = card.image
    ? {
        small: card.image + "/low.webp",
        large: card.image + "/high.png",
      }
    : {
        small: `https://images.pokemontcg.io/${normalizedId.split("-")[0]}/${normalizedId.split("-").slice(1).join("-")}.png`,
        large: `https://images.pokemontcg.io/${normalizedId.split("-")[0]}/${normalizedId.split("-").slice(1).join("-")}_hires.png`,
      };

  const builtVariants = buildVariants(card.variants);
  return {
    id: normalizedId,
    name: card.name,
    number: normalizedId.substring(normalizedId.lastIndexOf("-") + 1),
    rarity: card.rarity,
    supertype: card.category === "Pokemon" ? "Pokémon" : card.category,
    subtypes: buildSubtypes(card.stage, card.suffix),
    types: card.types,
    hp: card.hp !== undefined && card.hp !== null ? String(card.hp) : undefined,
    set: {
      id: normalizedId.substring(0, normalizedId.lastIndexOf("-")),
      name: card.set.name,
      series: setMeta.serieName,
      releaseDate,
    },
    images,
    variants: builtVariants.length > 0 ? builtVariants : ["normal"],
  };
}

export function briefToDisplayRow(
  brief: CardBrief,
  setName: string,
  ptcgId: string
): string {
  const number = ptcgId.substring(ptcgId.lastIndexOf("-") + 1);
  const nameCol = brief.name.padEnd(28);
  const setCol = setName.padEnd(22);
  return `${nameCol}  ${setCol}  #${number}  ${ptcgId}`;
}

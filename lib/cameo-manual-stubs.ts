/**
 * Manual PokemonCard stubs for cameo printings absent from TCGdex EN.
 */

import type { PokemonCard, PokemonCardSet } from "../types";
import type { CameoCardEntry } from "./cameo-catalogue";
import { cardBackImages } from "./card-image-placeholder";

const SET_BY_PREFIX: Record<string, PokemonCardSet> = {
  bwp: {
    id: "bwp",
    name: "BW-P Promos",
    series: "Black & White",
    releaseDate: "2011/07/01",
  },
  "smp-jp": {
    id: "smp-jp",
    name: "SM-P Promos",
    series: "Sun & Moon",
    releaseDate: "2017/03/01",
  },
  "tpp-jp": {
    id: "tpp-jp",
    name: "T Promos",
    series: "Other",
    releaseDate: "1998/01/01",
  },
  mep: {
    id: "mep",
    name: "MEP Promos",
    series: "Scarlet & Violet",
    releaseDate: "2023/03/31",
  },
  cs6bc: {
    id: "cs6bc",
    name: "Gem Pack Vol. 5",
    series: "Other",
    releaseDate: "2025/01/01",
  },
  "cdc2010-jp": {
    id: "cdc2010-jp",
    name: "2010 Card Design Contest",
    series: "Other",
    releaseDate: "2010/01/01",
  },
  "wcd2010-espeon": {
    id: "wcd2010",
    name: "2010 World Championships Decks",
    series: "Other",
    releaseDate: "2010/08/01",
  },
  "xyp-jp": {
    id: "xyp-jp",
    name: "XY-P Promos",
    series: "XY",
    releaseDate: "2014/01/01",
  },
};

function parseCatalogueId(id: string): { setId: string; number: string } {
  if (id.startsWith("smp-jp-")) {
    return { setId: "smp-jp", number: id.slice("smp-jp-".length) };
  }
  if (id.startsWith("tpp-jp-")) {
    return { setId: "tpp-jp", number: id.slice("tpp-jp-".length) };
  }
  if (id.startsWith("cdc2010-jp-")) {
    return { setId: "cdc2010-jp", number: id.slice("cdc2010-jp-".length) };
  }
  if (id.startsWith("xyp-jp-")) {
    return { setId: "xyp-jp", number: id.slice("xyp-jp-".length) };
  }
  if (id.startsWith("wcd2010-")) {
    return { setId: "wcd2010", number: "-" };
  }
  const dash = id.indexOf("-");
  if (dash <= 0) return { setId: id, number: "" };
  return { setId: id.slice(0, dash), number: id.slice(dash + 1) };
}

function resolveSet(entry: CameoCardEntry): PokemonCardSet {
  const id = entry.catalogueId ?? entry.key;
  const { setId } = parseCatalogueId(id);
  const known = SET_BY_PREFIX[setId] ?? SET_BY_PREFIX[entry.catalogueId ?? ""];
  if (known) return known;
  return {
    id: setId,
    name: entry.setName,
    series: entry.language === "ja" ? "Japanese" : entry.language === "zh-cn" ? "Chinese" : "Other",
    releaseDate: "",
  };
}

function inferSupertype(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes(" energy") || lower === "energy") {
    return "Energy";
  }
  if (
    lower.includes("stadium") ||
    lower.includes("party") ||
    lower.includes("oracle") ||
    lower.includes("quiz") ||
    lower.includes("questions") ||
    lower.includes("resort") ||
    lower.includes("festival") ||
    lower.includes("friends in")
  ) {
    return "Trainer";
  }
  return "Pokémon";
}

export function buildCameoManualStub(entry: CameoCardEntry): PokemonCard {
  if (!entry.catalogueId) {
    throw new Error(`Manual stub requires catalogueId: ${entry.key}`);
  }

  const set = resolveSet(entry);
  const number = entry.number === "-" ? entry.number : entry.number || parseCatalogueId(entry.catalogueId).number;

  return {
    id: entry.catalogueId,
    name: entry.cardName,
    number,
    supertype: inferSupertype(entry.cardName),
    set,
    images: cardBackImages(),
    variants: entry.notes?.toLowerCase().includes("jumbo") ? ["jumbo"] : ["normal"],
    catalogueLanguage: entry.language,
  };
}

export function isCameoManualEntry(entry: CameoCardEntry): boolean {
  return entry.ingest === "manual-only" || entry.resolution === "manual" || entry.resolution === "ambiguous";
}

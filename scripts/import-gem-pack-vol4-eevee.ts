/**
 * Add Gem Pack Vol. 4 (CBB4C) line-4 Eevee printings to manual-cards,
 * seed Pokewallet IDs, and mark them owned.
 *
 * Run: npx tsx scripts/import-gem-pack-vol4-eevee.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";
import type { PokewalletIdCache } from "./pokewallet-price-utils";
import { loadEnvFiles } from "./load-env";
import { upsertCollectionItem } from "../lib/db/collection";
import { getAppUserId, requireDatabaseUrl } from "../lib/db/config";

const SET = {
  id: "cbb4c",
  name: "Gem Pack Vol. 4",
  series: "Other",
  releaseDate: "2026/02/06",
} as const;

const TODAY = new Date().toISOString().slice(0, 10);

const PRINTINGS: Array<{
  slot: number;
  rarity: string;
  pokewalletId: string;
}> = [
  {
    slot: 1,
    rarity: "Type/attribute pattern",
    pokewalletId: "2db1eadc40c0bb46f1b45934ff96f87c21ef02ae1a3687d22a13b0f5de827e21",
  },
  {
    slot: 2,
    rarity: "Type/attribute pattern",
    pokewalletId: "3eda39b01961036ec0a2e8e13d100d109ad92ed76d1e60577b6defb6470cb274",
  },
  {
    slot: 3,
    rarity: "Poké Ball pattern",
    pokewalletId: "bb356fe3f03a31f59c0eb986fc88f9e9841b7ac53429a48547f8dd7b3128c36f",
  },
  {
    slot: 4,
    rarity: "Master Ball pattern",
    pokewalletId: "9bd1822d2f0d631aadb38b43c0a81cf77c19539abcbb72b94fc9c8200cb6e45d",
  },
  {
    slot: 5,
    rarity: "Gem Pack logo gold foil",
    pokewalletId: "ab54f10702e880f9a2169405c30062e1ebb36a40f481c8ef589fb68201e308c1",
  },
  {
    slot: 6,
    rarity: "Full art",
    pokewalletId: "a7b99aabdff62f403c391485fc3d14635869e31542cbb1fd808fd0019439818c",
  },
  {
    slot: 7,
    rarity: "Special art",
    pokewalletId: "bccf0e8cf31393c4f93ddca2d0cec5ec000d59375b7de2430c410c3f2ae2b179",
  },
];

function dextcgImage(imageId: string): string {
  return `https://dextcg.com/cdn-cgi/image/w%3D2048%2Cq%3D75%2Cf%3Dauto/https%3A//static.dextcg.com/cards/scn_cbb4/${imageId}.png`;
}

function buildCard(slot: number, rarity: string): PokemonCard {
  const imageId = `40${slot}`;
  const padded = String(slot).padStart(2, "0");
  return {
    id: `cbb4c-${imageId}`,
    name: "Eevee",
    number: `04 ${padded}/07`,
    rarity,
    supertype: "Pokémon",
    subtypes: ["Basic"],
    types: ["Colorless"],
    set: { ...SET },
    images: {
      small: dextcgImage(imageId),
      large: dextcgImage(imageId),
    },
    variants: ["normal"],
    catalogueLanguage: "zh-cn",
  };
}

async function main() {
  const addToCollection = !process.argv.includes("--skip-collection");
  const generated = PRINTINGS.map((p) => buildCard(p.slot, p.rarity));

  const manualPath = path.join(process.cwd(), "data", "manual-cards.json");
  const existing = JSON.parse(await fs.readFile(manualPath, "utf8")) as PokemonCard[];
  const existingIds = new Set(existing.map((c) => c.id));
  const toInsert = generated.filter((c) => !existingIds.has(c.id));
  if (toInsert.length !== generated.length && toInsert.length > 0) {
    throw new Error("Partial CBB4C Eevee overlap in manual-cards.json");
  }
  if (toInsert.length > 0) {
    const insertAfter = existing.findIndex((c) => c.id === "cbb2c-915");
    if (insertAfter < 0) throw new Error("cbb2c-915 not found for insert point");
    existing.splice(insertAfter + 1, 0, ...toInsert);
    await fs.writeFile(manualPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    console.log(`Added ${toInsert.length} CBB4C Eevee cards to manual-cards.json`);
  } else {
    console.log("manual-cards.json already has CBB4C Eevee cards");
  }

  const mapPath = path.join(process.cwd(), "data", "cbb4c-pokewallet-id-map.json");
  const mapFile: Record<string, unknown> = {
    _meta: {
      source: `CBB4C line 4 Eevee from live Pokewallet set ${TODAY}`,
      setCode: "CBB4C",
      cardCount: PRINTINGS.length,
      idFormat: "64-char hex (no pk_ prefix — required for GET /cards/:id on set-bulk IDs)",
    },
  };
  for (const printing of PRINTINGS) {
    mapFile[`cbb4c-40${printing.slot}`] = printing.pokewalletId;
  }
  await fs.writeFile(mapPath, `${JSON.stringify(mapFile, null, 2)}\n`, "utf8");
  console.log(`Wrote ${PRINTINGS.length} mappings -> ${mapPath}`);

  const cachePath = path.join(process.cwd(), "data", "pokewallet-id-cache.json");
  const cache = JSON.parse(await fs.readFile(cachePath, "utf8")) as PokewalletIdCache;
  for (const printing of PRINTINGS) {
    const cardId = `cbb4c-40${printing.slot}`;
    cache[cardId] = {
      pokewalletId: printing.pokewalletId,
      setCode: "CBB4C",
      resolvedAt: TODAY,
      matchScore: 100,
      searchQuery: `CBB4C line:4 slot:${String(printing.slot).padStart(2, "0")}/07`,
    };
  }
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  console.log("Seeded pokewallet-id-cache.json for CBB4C Eevee");

  if (!addToCollection) {
    console.log("Skipped collection insert (--skip-collection)");
    return;
  }

  await loadEnvFiles();
  requireDatabaseUrl();
  const userId = getAppUserId();
  if (!userId) throw new Error("APP_USER_ID is not set");

  for (const card of generated) {
    await upsertCollectionItem(userId, {
      cardId: card.id,
      variant: "normal",
      owned: true,
    });
    console.log(`Owned ${card.id} (${card.number} · ${card.rarity})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

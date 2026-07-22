/**
 * Seed pokewallet-id-cache.json with CBB2C pk_ IDs from data/cbb2c-pokewallet-id-map.json.
 * No API calls — positional map from Pokewallet GET /sets/CBB2C dump.
 *
 * Run with: npm run seed:cbb2c-ids [-- --force]
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";
import type { PokewalletIdCache } from "./pokewallet-price-utils";

const SET_CODE = "CBB2C";
const MATCH_SCORE = 100;

type Cbb2cMapMeta = {
  source?: string;
  setCode?: string;
  cardCount?: number;
  apiCardCount?: number;
  idFormat?: string;
};

type Cbb2cMapFile = {
  _meta?: Cbb2cMapMeta;
  [cardId: string]: string | Cbb2cMapMeta | undefined;
};

function parseArgs(argv: string[]): { force: boolean } {
  return { force: argv.includes("--force") };
}

function isValidCbb2cPokewalletId(id: string): boolean {
  return /^pk_[a-f0-9]+$/.test(id) || /^[a-f0-9]{64}$/.test(id);
}

function normalizeStoredId(id: string): string {
  return id.startsWith("pk_") ? id.slice(3) : id;
}

function lineSlotFromNumber(number: string): string {
  const m = number.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (!m) return number;
  return `line:${m[1]} slot:${m[2]}/${m[3]}`;
}

async function main() {
  const { force } = parseArgs(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);

  const mapPath = path.join(process.cwd(), "data", "cbb2c-pokewallet-id-map.json");
  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const cachePath = path.join(process.cwd(), "data", "pokewallet-id-cache.json");

  const mapRaw = JSON.parse(await fs.readFile(mapPath, "utf8")) as Cbb2cMapFile;
  const { _meta, ...idToPk } = mapRaw;
  const mapEntries = Object.entries(idToPk).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );

  const allCards = JSON.parse(await fs.readFile(cardsPath, "utf8")) as PokemonCard[];
  const cbb2cCards = allCards.filter((c) => c.id.startsWith("cbb2c-"));
  const cbb2cById = new Map(cbb2cCards.map((c) => [c.id, c]));

  const mapIds = new Set(mapEntries.map(([id]) => id));
  const missingInMap = cbb2cCards.filter((c) => !mapIds.has(c.id)).map((c) => c.id);
  const orphanMapIds = mapEntries
    .map(([id]) => id)
    .filter((id) => !cbb2cCards.some((c) => c.id === id));

  if (missingInMap.length > 0) {
    throw new Error(
      `Catalogue cbb2c cards missing from map (${missingInMap.length}): ${missingInMap.slice(0, 5).join(", ")}…`
    );
  }
  if (orphanMapIds.length > 0) {
    throw new Error(
      `Map contains ids not in catalogue (${orphanMapIds.length}): ${orphanMapIds.slice(0, 5).join(", ")}…`
    );
  }

  let cache: PokewalletIdCache = {};
  try {
    cache = JSON.parse(await fs.readFile(cachePath, "utf8")) as PokewalletIdCache;
  } catch {
    cache = {};
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const [cardId, rawPokewalletId] of mapEntries) {
    if (!isValidCbb2cPokewalletId(rawPokewalletId)) {
      throw new Error(`Invalid pokewalletId for ${cardId}: ${rawPokewalletId}`);
    }
    const pokewalletId = normalizeStoredId(rawPokewalletId);
    const catalogueCard = cbb2cById.get(cardId);

    const existing = cache[cardId]?.pokewalletId;
    if (existing && !force) {
      skipped++;
      continue;
    }

    const entry = {
      pokewalletId,
      setCode: SET_CODE,
      resolvedAt: today,
      matchScore: MATCH_SCORE,
      searchQuery: catalogueCard
        ? `CBB2C ${lineSlotFromNumber(catalogueCard.number)}`
        : `CBB2C ${cardId}`,
    };

    if (existing) {
      cache[cardId] = entry;
      updated++;
    } else {
      cache[cardId] = entry;
      added++;
    }
  }

  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf8");

  const cbb2cCached = cbb2cCards.filter((c) => cache[c.id]?.pokewalletId).length;

  console.log(`CBB2C map: ${mapEntries.length} entries (${_meta?.source ?? "no meta"})`);
  console.log(`Cache: ${added} added, ${updated} updated, ${skipped} skipped (use --force to overwrite)`);
  console.log(`CBB2C cards with pkid in cache: ${cbb2cCached} / ${cbb2cCards.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

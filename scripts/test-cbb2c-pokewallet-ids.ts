/**
 * Offline tests for CBB2C pokewallet-id map + cache seeding.
 *
 * Run with: npm run test:cbb2c-ids
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";
import type { PokewalletIdCache } from "./pokewallet-price-utils";

const EXPECTED_COUNT = 131;

/** Spot-checks from live Pokewallet CBB2C set (64-char hex, no pk_ prefix). */
const SPOT_CHECKS: Record<string, string> = {
  "cbb2c-101": "f98c114c1cfc6a8f8789c4cd960cbfe776c2a73639b771529e097e056e614687",
  "cbb2c-115": "b294b758f828c61ed2042f82b05ca3c507abb61365f9d793ae8230384e891ef8",
  "cbb2c-113": "c561c68f605133fc3890dbd5c72204217a2d378fd7017ef2377e3a5531824395",
  "cbb2c-1004": "3c8bb5e4610444ca8bffb05a9febf0c06c95ff1d0a776ac18653d19f0b6e9db3",
  "cbb2c-615": "609c3e7ad537f3d4f160c262d64af872a1ceba3fa153c05a111045374b179714",
  "cbb2c-710": "df3070172ddbd8fdecb37fb97558f62dc96e479bf33450bf7c3d0697a34fa830",
  "cbb2c-913": "bc66cd32b65c8be86c5d3bfd8a1bc40c8790a7236b463a0d4bc81e74f404a23e",
  "cbb2c-914": "4745381f9c39a8dbb7a7e905570c457f4c671313e02f173a06d3c6b2fd7029e9",
};

function normalizeId(id: string): string {
  return id.startsWith("pk_") ? id.slice(3) : id;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  const mapPath = path.join(process.cwd(), "data", "cbb2c-pokewallet-id-map.json");
  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const cachePath = path.join(process.cwd(), "data", "pokewallet-id-cache.json");

  const mapRaw = JSON.parse(await fs.readFile(mapPath, "utf8")) as Record<string, string>;
  const { _meta: _m, ...idToPk } = mapRaw as Record<string, unknown>;
  void _m;
  const mapEntries = Object.entries(idToPk).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );

  assert(mapEntries.length === EXPECTED_COUNT, `Map has ${mapEntries.length} entries, expected ${EXPECTED_COUNT}`);

  const allCards = JSON.parse(await fs.readFile(cardsPath, "utf8")) as PokemonCard[];
  const cbb2cCards = allCards.filter((c) => c.id.startsWith("cbb2c-"));
  assert(
    cbb2cCards.length === EXPECTED_COUNT,
    `Catalogue has ${cbb2cCards.length} cbb2c cards, expected ${EXPECTED_COUNT}`
  );

  for (const card of cbb2cCards) {
    assert(idToPk[card.id] !== undefined, `Map missing ${card.id}`);
  }

  const cache = JSON.parse(await fs.readFile(cachePath, "utf8")) as PokewalletIdCache;

  for (const card of cbb2cCards) {
    const entry = cache[card.id];
    assert(!!entry?.pokewalletId, `Cache missing pkid for ${card.id}`);
    assert(
      /^pk_[a-f0-9]+$/.test(entry.pokewalletId) || /^[a-f0-9]{64}$/.test(entry.pokewalletId),
      `Invalid pkid format for ${card.id}`
    );
    assert(entry.setCode === "CBB2C", `Wrong setCode for ${card.id}: ${entry.setCode}`);
    assert(
      normalizeId(entry.pokewalletId) === normalizeId(String(idToPk[card.id])),
      `Cache pkid for ${card.id} does not match map`
    );
  }

  for (const [cardId, expectedPk] of Object.entries(SPOT_CHECKS)) {
    assert(normalizeId(String(idToPk[cardId])) === expectedPk, `Spot check map failed for ${cardId}`);
    assert(normalizeId(cache[cardId]?.pokewalletId ?? "") === expectedPk, `Spot check cache failed for ${cardId}`);
  }

  console.log(`OK: ${EXPECTED_COUNT} CBB2C cards mapped and cached (${Object.keys(SPOT_CHECKS).length} spot checks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

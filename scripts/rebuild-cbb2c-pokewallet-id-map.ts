/**
 * Fetch live CBB2C set cards from Pokewallet and rebuild
 * data/cbb2c-pokewallet-id-map.json by matching catalogue slots to API order.
 *
 * Run with: npm run rebuild:cbb2c-map
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";
import { loadEnvFiles } from "./load-env";
import { PokewalletClient, type PokewalletCardResult } from "./pokewallet-client";

const SET_CODE = "CBB2C";

type LineSpec = { line: number; slot: number; total: number };

function parseCatalogueNumber(number: string): LineSpec {
  const m = number.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (!m) throw new Error(`Unparseable catalogue number: ${number}`);
  return { line: parseInt(m[1], 10), slot: parseInt(m[2], 10), total: parseInt(m[3], 10) };
}

/** Map catalogue slot (within a line) to index in Pokewallet's API order for that line. */
function catalogueSlotToApiIndex(slot: number, total: number): number {
  if (total === 15) {
    if (slot <= 12) return slot - 1;
    if (slot === 13) return 13;
    if (slot === 14) return 14;
    if (slot === 15) return 12;
    throw new Error(`Invalid 15-card slot: ${slot}`);
  }
  if (total === 14) {
    if (slot <= 12) return slot - 1;
    if (slot === 13) return 12;
    if (slot === 14) return 13;
    throw new Error(`Invalid 14-card slot: ${slot}`);
  }
  if (total === 4) {
    return slot - 1;
  }
  throw new Error(`Unsupported line total: ${total}`);
}

function normalizeApiId(id: string): string {
  return id.startsWith("pk_") ? id.slice(3) : id;
}

function groupApiCardsByLine(cards: PokewalletCardResult[]): Map<number, PokewalletCardResult[]> {
  const groups = new Map<number, PokewalletCardResult[]>();
  for (const card of cards) {
    const line = parseInt(card.card_info?.card_number ?? "", 10);
    if (!Number.isFinite(line)) continue;
    const list = groups.get(line) ?? [];
    list.push(card);
    groups.set(line, list);
  }
  return groups;
}

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();
  const today = new Date().toISOString().slice(0, 10);

  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const mapPath = path.join(process.cwd(), "data", "cbb2c-pokewallet-id-map.json");

  const allCards = JSON.parse(await fs.readFile(cardsPath, "utf8")) as PokemonCard[];
  const cbb2cCards = allCards.filter((c) => c.id.startsWith("cbb2c-"));

  console.log(`Fetching live ${SET_CODE} set from Pokewallet...`);
  const { setMeta, cards: apiCards } = await client.fetchAllSetCards(SET_CODE);
  console.log(`  ${setMeta.name}: ${apiCards.length} API cards`);

  const byLine = groupApiCardsByLine(apiCards);
  const map: Record<string, string> = {};
  const usedApiIds = new Set<string>();

  for (const card of cbb2cCards) {
    const spec = parseCatalogueNumber(card.number);
    const group = byLine.get(spec.line);
    if (!group) {
      throw new Error(`No API cards for line ${spec.line} (${card.id} ${card.name})`);
    }

    let apiCard: PokewalletCardResult | undefined;
    if (spec.line === 10) {
      apiCard = group.find((c) => c.card_info?.name === card.name);
      if (!apiCard) {
        throw new Error(`No API trainer named "${card.name}" for ${card.id}`);
      }
    } else {
      const apiIndex = catalogueSlotToApiIndex(spec.slot, spec.total);
      apiCard = group[apiIndex];
      if (!apiCard) {
        throw new Error(
          `No API card at line ${spec.line} index ${apiIndex} for ${card.id} (${card.number})`
        );
      }
    }

    const pokewalletId = normalizeApiId(apiCard.id);
    if (usedApiIds.has(pokewalletId)) {
      throw new Error(`Duplicate API id ${pokewalletId} for ${card.id}`);
    }
    usedApiIds.add(pokewalletId);
    map[card.id] = pokewalletId;
  }

  const out = {
    _meta: {
      source: `CBB2C live set rebuild ${today}`,
      setCode: SET_CODE,
      cardCount: cbb2cCards.length,
      apiCardCount: apiCards.length,
      idFormat: "64-char hex (no pk_ prefix — required for GET /cards/:id on set-bulk IDs)",
    },
    ...map,
  };

  await fs.writeFile(mapPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${cbb2cCards.length} mappings -> ${mapPath}`);
  console.log(client.formatRateLimitStatus());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

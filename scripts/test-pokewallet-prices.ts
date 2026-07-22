/**
 * Test Pokewallet ID resolution and pricing on 3 random (or specific) cards.
 *
 * Run with:
 *   npm run test:pokewallet-prices
 *   npm run test:pokewallet-prices -- --cards swsh12pt5gg-GG35,cbb2c-101,base2-3
 *   npm run test:pokewallet-prices -- --seed 42
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";
import { loadEnvFiles } from "./load-env";
import { parseBatchCli, pickRandomItems } from "./pokewallet-cli";
import { PokewalletClient } from "./pokewallet-client";
import {
  buildSearchQueries,
  peekPrices,
  pokewalletResultToPriceEntry,
  resolvePokewalletIdViaSearch,
  scorePokewalletMatch,
} from "./pokewallet-price-utils";
import type { PokewalletCardResult } from "./pokewallet-client";

const TODAY = new Date().toISOString().slice(0, 10);

function formatHit(result: PokewalletCardResult, card: PokemonCard): string {
  const p = peekPrices(result);
  const score = scorePokewalletMatch(card, result);
  return [
    `    - ${result.card_info.name ?? "?"} #${result.card_info.card_number ?? "?"}`,
    `id=${result.id.slice(0, 24)}…`,
    `usd=${p.usd ?? "—"}`,
    `eur=${p.eur ?? "—"}`,
    `score=${score}`,
  ].join(" | ");
}

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();
  const opts = parseBatchCli(process.argv.slice(2));

  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const allCards = JSON.parse(await fs.readFile(cardsPath, "utf8")) as PokemonCard[];

  let testCards: PokemonCard[];
  if (opts.cards && opts.cards.length > 0) {
    testCards = opts.cards
      .map((id) => allCards.find((c) => c.id === id))
      .filter((c): c is PokemonCard => c !== undefined);
    if (testCards.length === 0) {
      console.error("No matching cards found for --cards ids");
      process.exit(1);
    }
  } else {
    const seed = opts.seed ?? Date.now();
    testCards = pickRandomItems(allCards, 3, seed);
    console.log(`Picked 3 random cards (seed ${seed})`);
  }

  console.log("Loading Pokewallet set index...");
  const allSets = await client.listSets();
  console.log(`${allSets.length} sets indexed.\n`);

  for (const card of testCards) {
    console.log("=".repeat(60));
    console.log(`Card: ${card.id}`);
    console.log(`  ${card.name} #${card.number} (${card.set.name})`);

    const queries = buildSearchQueries(card, allSets);
    console.log(`  Search queries: ${JSON.stringify(queries)}`);

    for (const query of queries.slice(0, 2)) {
      try {
        const data = await client.search(query, 5);
        if (data.results.length > 0) {
          console.log(`  Hits for "${query}":`);
          for (const r of data.results.slice(0, 3)) {
            console.log(formatHit(r, card));
          }
        }
      } catch (err) {
        console.log(`  Search "${query}" failed: ${(err as Error).message}`);
      }
    }

    try {
      const resolved = await resolvePokewalletIdViaSearch(
        card,
        allSets,
        async (query) => {
          const data = await client.search(query, 15);
          return data.results;
        },
        TODAY
      );

      if (!resolved) {
        console.log("  RESULT: No match found");
        continue;
      }

      console.log(`  Best match: ${resolved.entry.pokewalletId}`);
      console.log(`  Score: ${resolved.score} | Query: "${resolved.query}"`);

      const detail = await client.getCard(
        resolved.entry.pokewalletId,
        resolved.entry.setCode || undefined
      );
      const peek = peekPrices(detail);
      console.log(`  GET /cards/:id → usd=${peek.usd ?? "—"} eur=${peek.eur ?? "—"}`);

      const entry = pokewalletResultToPriceEntry(detail, TODAY);
      if (entry) {
        console.log(`  PriceEntry: ${JSON.stringify(entry, null, 2).split("\n").join("\n  ")}`);
      } else {
        console.log("  PriceEntry: (no USD/EUR data on card detail)");
      }
    } catch (err) {
      console.log(`  RESULT: Error — ${(err as Error).message}`);
    }

    console.log("");
  }

  console.log("=".repeat(60));
  console.log(
    `Done. ${client.formatRateLimitStatus()}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

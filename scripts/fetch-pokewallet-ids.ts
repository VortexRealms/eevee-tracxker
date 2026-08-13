/**
 * Phase A: Resolve Pokewallet pk_ IDs for cards in data/cards.json via /search.
 * Writes data/pokewallet-id-cache.json (resumable with --only-missing).
 *
 * Run with: npm run fetch:pokewallet-ids [-- --limit 100 --offset 0]
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";
import { loadEnvFiles } from "./load-env";
import { parseBatchCli, sliceBatch } from "./pokewallet-cli";
import { PokewalletClient } from "./pokewallet-client";
import {
  preserveCuratedVariantIds,
  resolvePokewalletIdViaSearch,
  type PokewalletIdCache,
} from "./pokewallet-price-utils";

const TODAY = new Date().toISOString().slice(0, 10);

async function loadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();
  const opts = parseBatchCli(process.argv.slice(2));

  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const cachePath = path.join(process.cwd(), "data", "pokewallet-id-cache.json");

  const allCards = JSON.parse(await fs.readFile(cardsPath, "utf8")) as PokemonCard[];
  const cache = await loadJson<PokewalletIdCache>(cachePath, {});

  let candidates = allCards;
  if (opts.cards?.length) {
    const allow = new Set(opts.cards);
    candidates = candidates.filter((c) => allow.has(c.id));
  }
  if (opts.onlyMissing) {
    candidates = candidates.filter((c) => !cache[c.id]?.pokewalletId);
  }
  const batch = sliceBatch(candidates, opts.offset, opts.limit);

  console.log(
    `Resolving Pokewallet IDs for ${batch.length} card(s) (${allCards.length} total, ${Object.keys(cache).length} already cached)...`
  );

  console.log("  Loading Pokewallet set index...");
  const allSets = await client.listSets();
  console.log(`  ${allSets.length} sets indexed.`);

  let resolved = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < batch.length; i++) {
    const card = batch[i];
    if (cache[card.id]?.pokewalletId && opts.onlyMissing) {
      skipped++;
      continue;
    }
    if (cache[card.id]?.pokewalletId && !opts.onlyMissing) {
      skipped++;
      if (opts.verbose) {
        console.log(`  [skip] ${card.id} already cached as ${cache[card.id].pokewalletId}`);
      }
      continue;
    }

    process.stdout.write(
      `  [${i + 1}/${batch.length}] ${card.id} (${card.name})... `
    );

    try {
      const match = await resolvePokewalletIdViaSearch(
        card,
        allSets,
        async (query) => {
          const data = await client.search(query, 15);
          return data.results;
        },
        TODAY
      );

      if (match) {
        cache[card.id] = preserveCuratedVariantIds(match.entry, cache[card.id]);
        resolved++;
        console.log(`ok → ${match.entry.pokewalletId.slice(0, 20)}… (score ${match.score}, q="${match.query}")`);
      } else {
        failed++;
        console.log("no match");
      }
    } catch (err) {
      failed++;
      console.log(`error: ${(err as Error).message}`);
    }
  }

  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2) + "\n", "utf8");

  console.log(
    `\nCache updated: ${resolved} resolved, ${failed} failed, ${skipped} skipped`
  );
  console.log(
    `Total cached: ${Object.keys(cache).length} / ${allCards.length}`
  );
  console.log(client.formatRateLimitStatus());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

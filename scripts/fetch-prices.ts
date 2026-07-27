/**
 * Phase B: Fetch prices from Pokewallet GET /cards/:id using pokewallet-id-cache.json.
 * Writes results to the Google Sheet "prices" tab (live — no deploy needed).
 *
 * Run fetch:pokewallet-ids first to build the cache.
 *
 * Run with: npm run fetch:prices [-- --limit 100 --offset 0] [-- --force]
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard, PriceEntry, PricesMeta } from "../types";
import {
  exchangeRatesToMeta,
  fetchLiveExchangeRates,
  metaToExchangeRates,
} from "../lib/exchange-rates";
import { localTodayIso, shouldSkipPriceFetch } from "../lib/fetch-price-skip";
import { getPricesSnapshot, syncPricesToSheet } from "../lib/google-sheets";
import { mergePriceEntries } from "../lib/price-merge";
import { loadEnvFiles } from "./load-env";
import { parseBatchCli, sliceBatch } from "./pokewallet-cli";
import { PokewalletClient } from "./pokewallet-client";
import {
  pokewalletResultToPriceEntry,
  type PokewalletIdCache,
} from "./pokewallet-price-utils";
import { writePriceHistorySnapshot } from "./price-history-sqlite";

const SYNC_EVERY_N = 50;

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

  console.log("  Loading existing prices from Google Sheet...");
  const existingSnapshot = await getPricesSnapshot();
  const fetchedEntries: Record<string, PriceEntry> = { ...existingSnapshot.entries };

  const withCache = allCards.filter((c) => cache[c.id]?.pokewalletId);
  const batch = sliceBatch(withCache, opts.offset, opts.limit);

  if (withCache.length === 0) {
    console.warn(
      "No cached Pokewallet IDs found. Run: npm run fetch:pokewallet-ids"
    );
    process.exit(1);
  }

  console.log(
    `Fetching prices for ${batch.length} card(s) (${withCache.length} with cached IDs, ${allCards.length} total)...`
  );

  const today = localTodayIso();
  if (!opts.force) {
    console.log(
      `  Skipping cards with updatedAt=${today} and source=manual (use --force to refetch today's pokewallet rows)`
    );
  }

  let priced = 0;
  let noPriceData = 0;
  let errors = 0;
  let skippedFresh = 0;
  let skippedManual = 0;
  let syncedSinceLast = 0;

  async function maybeSyncPartial(meta: PricesMeta) {
    syncedSinceLast = 0;
    const result = await syncPricesToSheet(fetchedEntries, meta);
    console.log(
      `\n  Synced to Sheet: ${result.updated} updated, ${result.appended} appended, ${result.skipped} manual skipped`
    );
  }

  let meta: PricesMeta = existingSnapshot.meta;

  for (let i = 0; i < batch.length; i++) {
    const card = batch[i];
    const cached = cache[card.id];
    if (!cached?.pokewalletId) continue;

    process.stdout.write(`  [${i + 1}/${batch.length}] ${card.id}... `);

    const prior = fetchedEntries[card.id];
    const { skip, reason } = shouldSkipPriceFetch(prior, today, opts.force);
    if (skip) {
      if (reason === "manual") skippedManual++;
      else if (reason === "fresh") skippedFresh++;
      console.log(`skip (${reason})`);
      continue;
    }

    try {
      const result = await client.getCard(
        cached.pokewalletId,
        cached.setCode || undefined
      );
      const entry = pokewalletResultToPriceEntry(result, today);
      if (entry) {
        fetchedEntries[card.id] = mergePriceEntries(entry, prior);
        priced++;
        syncedSinceLast++;
        console.log(`$${entry.usd ?? "—"} / €${entry.eur ?? "—"}`);
      } else {
        noPriceData++;
        console.log("no price data");
      }
    } catch (err) {
      errors++;
      console.log(`error: ${(err as Error).message}`);
    }

    if (syncedSinceLast >= SYNC_EVERY_N) {
      await maybeSyncPartial(meta);
    }
  }

  process.stdout.write("\nFetching exchange rates... ");
  try {
    const liveRates = await fetchLiveExchangeRates();
    meta = exchangeRatesToMeta(liveRates);
    const derived = metaToExchangeRates(meta);
    console.log(
      `as of ${meta.ratesUpdatedAt}, EUR/USD=${derived.eurUsdRate.toFixed(4)} (derived)`
    );
  } catch (err) {
    console.warn(`failed (${(err as Error).message}), keeping existing meta`);
  }

  const syncResult = await syncPricesToSheet(fetchedEntries, meta);

  const finalSnapshot = { meta, entries: fetchedEntries };
  const historyResult = writePriceHistorySnapshot({
    allCards,
    snapshot: finalSnapshot,
    observedDate: today,
  });
  console.log(
    `\nPrice history snapshot (${historyResult.observedDate}): ${historyResult.pointCount} point(s) ` +
      `(${historyResult.inserted} inserted, ${historyResult.updated} updated) -> ${historyResult.dbPath}`
  );

  const noCache = allCards.length - withCache.length;
  console.log(
    `\nSynced ${Object.keys(fetchedEntries).length} price entries to Google Sheet (prices tab)`
  );
  console.log(
    `  Sheet write: ${syncResult.updated} updated, ${syncResult.appended} appended, ${syncResult.skipped} manual skipped`
  );
  console.log(
    `  This batch: ${priced} priced, ${skippedFresh + skippedManual} skipped (${skippedFresh} fresh, ${skippedManual} manual), ${noPriceData} no data, ${errors} errors`
  );
  console.log(`  ${noCache} card(s) have no cached Pokewallet ID — run fetch:pokewallet-ids`);
  console.log(client.formatRateLimitStatus());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

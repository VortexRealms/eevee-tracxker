/**
 * Phase B: Fetch prices from Pokewallet and explicit eBay mappings.
 * Writes results to the git-tracked SQLite price database (current prices + daily history).
 *
 * Run fetch:pokewallet-ids first to build the cache.
 *
 * Run with: npm run fetch:prices [-- --limit 100 --offset 0] [-- --force]
 *           [-- --cards id1,id2] [-- --provider pokewallet|ebay|all]
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard, PriceEntry, PricesMeta } from "../types";
import {
  exchangeRatesToMeta,
  fetchLiveExchangeRates,
  metaToExchangeRates,
} from "../lib/exchange-rates";
import { localTodayIso, shouldSkipVariantPriceFetch } from "../lib/fetch-price-skip";
import { loadEbayPriceMappings, slotKey } from "../lib/ebay-price-mappings";
import { mergePriceEntries } from "../lib/price-merge";
import { mergeHoloOnlyPromoPriceEntry } from "../lib/cards";
import { remapPriceEntryVariantsToCatalogue } from "../lib/variant-catalogue-fixes";
import { applyVariantRecordToEntry, buildProviderPlan } from "../lib/price-provider-planner";
import { getPricesSnapshotFromDb, syncPricesToDb } from "../lib/price-db";
import { loadEnvFiles } from "./load-env";
import { parseBatchCli, sliceBatch } from "./pokewallet-cli";
import { PokewalletClient } from "./pokewallet-client";
import { EbayBrowseClient } from "./ebay-browse-client";
import { estimateEbayAskingMedian } from "./ebay-price-utils";
import {
  hasCachedPokewalletId,
  pokewalletResultToCatalogueVariantPrice,
  pokewalletResultToPriceEntry,
  type PokewalletIdCache,
} from "./pokewallet-price-utils";
import { writePriceHistorySnapshot } from "./price-history-sqlite";

const SYNC_EVERY_N = 50;

type ProviderFilter = "all" | "pokewallet" | "ebay";

function parseProviderFilter(argv: string[]): ProviderFilter {
  const idx = argv.indexOf("--provider");
  if (idx >= 0 && argv[idx + 1]) {
    const value = argv[idx + 1].toLowerCase();
    if (value === "pokewallet" || value === "ebay" || value === "all") {
      return value;
    }
  }
  return "all";
}

async function loadJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function buildCatalogueVariantsByCard(cards: PokemonCard[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const card of cards) {
    out[card.id] = card.variants?.length ? card.variants : ["normal"];
  }
  return out;
}

function buildCardsById(cards: PokemonCard[]): Record<string, PokemonCard> {
  return Object.fromEntries(cards.map((card) => [card.id, card]));
}

async function main() {
  await loadEnvFiles();
  const argv = process.argv.slice(2);
  const providerFilter = parseProviderFilter(argv);
  const client = PokewalletClient.fromEnv();

  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const cachePath = path.join(process.cwd(), "data", "pokewallet-id-cache.json");

  const allCards = JSON.parse(await fs.readFile(cardsPath, "utf8")) as PokemonCard[];
  const cache = await loadJson<PokewalletIdCache>(cachePath, {});
  const ebayMappings = loadEbayPriceMappings();
  const catalogueVariantsByCard = buildCatalogueVariantsByCard(allCards);
  const cardsById = buildCardsById(allCards);

  console.log("  Loading existing prices from SQLite...");
  const existingSnapshot = getPricesSnapshotFromDb();
  const fetchedEntries: Record<string, PriceEntry> = { ...existingSnapshot.entries };

  let withCache = allCards.filter((c) => hasCachedPokewalletId(cache[c.id]));
  const opts = parseBatchCli(argv);
  if (opts.cards?.length) {
    const allow = new Set(opts.cards);
    withCache = withCache.filter((c) => allow.has(c.id));
  }
  const batch = sliceBatch(withCache, opts.offset, opts.limit);

  const ebayCards = allCards.filter((card) =>
    (card.variants ?? ["normal"]).some((variant) => ebayMappings[slotKey(card.id, variant)])
  );
  const planCards =
    opts.cards?.length ?
      allCards.filter((c) => new Set(opts.cards).has(c.id))
    : providerFilter === "ebay" ? ebayCards : batch;

  if (withCache.length === 0 && Object.keys(ebayMappings).length === 0) {
    console.warn("No cached Pokewallet IDs or eBay mappings found.");
    process.exit(1);
  }

  console.log(
    `Fetching prices (provider=${providerFilter}) for ${planCards.length} card(s)...`
  );

  const today = localTodayIso();
  if (!opts.force) {
    console.log(
      `  Skipping fresh/manual variant rows for ${today} (use --force to refetch)`
    );
  }

  let priced = 0;
  let noPriceData = 0;
  let errors = 0;
  let skippedFresh = 0;
  let skippedManual = 0;
  let syncedSinceLast = 0;
  let pokewalletApiCalls = 0;
  let ebayApiCalls = 0;

  const plan = buildProviderPlan({
    cards: planCards,
    cache,
    ebayMappings,
  });

  async function maybeSyncPartial(meta: PricesMeta) {
    syncedSinceLast = 0;
    const result = syncPricesToDb(
      fetchedEntries,
      meta,
      catalogueVariantsByCard,
      cardsById
    );
    console.log(
      `\n  Synced to SQLite: ${result.updated} updated, ${result.appended} appended, ${result.skipped} manual skipped`
    );
  }

  let meta: PricesMeta = existingSnapshot.meta;

  if (providerFilter === "all" || providerFilter === "pokewallet") {
    const groups = [...plan.pokewalletGroups.entries()];
    console.log(`  Pokewallet: ${groups.length} unique resource group(s)`);

    for (let i = 0; i < groups.length; i++) {
      const [, jobs] = groups[i];
      const sample = jobs[0];
      const resourceLabel = `${sample.resource.pokewalletId.slice(0, 12)}…`;

      const pendingJobs = jobs.filter((job) => {
        const prior = fetchedEntries[job.cardId]?.variants?.[job.catalogueVariant];
        const { skip, reason } = shouldSkipVariantPriceFetch(prior, today, opts.force);
        if (skip) {
          if (reason === "manual") skippedManual++;
          else if (reason === "fresh") skippedFresh++;
        }
        return !skip;
      });

      if (pendingJobs.length === 0) {
        continue;
      }

      process.stdout.write(
        `  [pw ${i + 1}/${groups.length}] ${resourceLabel} (${pendingJobs.length} variant job(s))... `
      );

      try {
        const result = await client.getCard(
          sample.resource.pokewalletId,
          sample.resource.setCode || undefined
        );
        pokewalletApiCalls++;

        for (const job of pendingJobs) {
          const part =
            job.catalogueVariant === "__default__" ||
            Object.keys(cache[job.cardId]?.variants ?? {}).length === 0
              ? pokewalletResultToPriceEntry(result, today)
              : pokewalletResultToCatalogueVariantPrice(
                  result,
                  job.catalogueVariant,
                  today
                );

          if (!part) {
            noPriceData++;
            continue;
          }

          const prior = fetchedEntries[job.cardId];
          const card = cardsById[job.cardId];
          const mergedPart = card
            ? remapPriceEntryVariantsToCatalogue(
                job.cardId,
                mergeHoloOnlyPromoPriceEntry(card, part)
              )
            : part;
          fetchedEntries[job.cardId] = mergePriceEntries(mergedPart, prior);
          priced++;
          syncedSinceLast++;
        }

        console.log("ok");
      } catch (err) {
        errors++;
        console.log(`error: ${(err as Error).message}`);
      }

      if (syncedSinceLast >= SYNC_EVERY_N) {
        await maybeSyncPartial(meta);
      }
    }
  }

  if (providerFilter === "all" || providerFilter === "ebay") {
    if (plan.ebayJobs.length > 0) {
      console.log(`  eBay: ${plan.ebayJobs.length} explicit variant job(s)`);
    }

    let ebayClient: EbayBrowseClient | null = null;
    try {
      ebayClient = EbayBrowseClient.fromEnv();
    } catch (err) {
      if (plan.ebayJobs.length > 0) {
        console.warn(`  eBay client unavailable: ${(err as Error).message}`);
      }
    }

    const rates = metaToExchangeRates(meta);

    for (const job of plan.ebayJobs) {
      const prior = fetchedEntries[job.cardId]?.variants?.[job.variant];
      const { skip, reason } = shouldSkipVariantPriceFetch(prior, today, opts.force);
      if (skip) {
        if (reason === "manual") skippedManual++;
        else if (reason === "fresh") skippedFresh++;
        continue;
      }

      if (!ebayClient) {
        errors++;
        continue;
      }

      process.stdout.write(
        `  [ebay] ${job.cardId}.${job.variant} (${job.mapping.queries[0]})... `
      );

      try {
        const items = (
          await Promise.all(
            job.mapping.queries.map((q) => {
              ebayApiCalls++;
              return ebayClient!.searchAllPages({
                q,
                categoryId: job.mapping.categoryId,
                limitPerPage: job.mapping.limitPerPage,
                maxPages: job.mapping.maxPages,
              });
            })
          )
        ).flat();

        const estimate = estimateEbayAskingMedian({
          items,
          mapping: job.mapping,
          rates,
          updatedAt: today,
        });

        if (!estimate.record) {
          noPriceData++;
          console.log(
            `no price (${estimate.accepted.length} accepted / ${estimate.rejected.length} rejected)`
          );
          continue;
        }

        applyVariantRecordToEntry(
          fetchedEntries,
          job.cardId,
          job.variant,
          estimate.record,
          today
        );
        priced++;
        syncedSinceLast++;
        console.log(
          `$${estimate.record.usd ?? "—"} (${estimate.record.sampleCount} listings)`
        );
      } catch (err) {
        errors++;
        console.log(`error: ${(err as Error).message}`);
      }

      if (syncedSinceLast >= SYNC_EVERY_N) {
        await maybeSyncPartial(meta);
      }
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

  const syncResult = syncPricesToDb(
    fetchedEntries,
    meta,
    catalogueVariantsByCard,
    cardsById
  );

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
  if (historyResult.prune) {
    const p = historyResult.prune;
    if (p.deletedPoints + p.deletedRuns > 0) {
      console.log(
        `  Pruned ${p.deletedPoints} point(s) and ${p.deletedRuns} run(s) older than ${p.cutoffDate}` +
          (p.vacuumed ? " (vacuumed)" : "")
      );
    }
  }

  const noCache = allCards.length - withCache.length;
  console.log(
    `\nSynced ${Object.keys(fetchedEntries).length} price entries to SQLite (current_prices)`
  );
  console.log(
    `  SQLite write: ${syncResult.updated} updated, ${syncResult.appended} appended, ${syncResult.skipped} manual skipped`
  );
  console.log(
    `  This run: ${priced} priced, ${skippedFresh + skippedManual} skipped (${skippedFresh} fresh, ${skippedManual} manual), ${noPriceData} no data, ${errors} errors`
  );
  console.log(
    `  API calls: ${pokewalletApiCalls} Pokewallet, ${ebayApiCalls} eBay search page(s)`
  );
  console.log(`  ${noCache} card(s) have no cached Pokewallet ID — run fetch:pokewallet-ids`);
  console.log(client.formatRateLimitStatus());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-time migration: seed the Google Sheet "prices" tab from local JSON files.
 *
 * Run with: npm run migrate:prices-to-sheet
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PriceEntry, PricesMeta } from "../types";
import { syncAllPricesToSheet } from "../lib/google-sheets";
import { loadEnvFiles } from "./load-env";

type ManualPricesMap = Record<
  string,
  {
    usd?: number;
    eur?: number;
    updatedAt?: string;
    variants?: Record<string, { usd?: number; eur?: number }>;
  }
>;

function mergeManualIntoEntry(
  base: PriceEntry | undefined,
  manual: ManualPricesMap[string],
  today: string
): PriceEntry {
  const entry: PriceEntry = base
    ? { ...base }
    : { usd: null, eur: null, updatedAt: today };

  if (manual.usd !== undefined) entry.usd = manual.usd;
  if (manual.eur !== undefined) entry.eur = manual.eur;
  if (manual.updatedAt) entry.updatedAt = manual.updatedAt;

  if (manual.variants) {
    entry.variants = { ...(entry.variants ?? {}) };
    for (const [variant, prices] of Object.entries(manual.variants)) {
      entry.variants[variant] = {
        ...(entry.variants[variant] ?? {}),
        ...prices,
      };
    }
  }

  if (!entry.updatedAt) entry.updatedAt = today;
  return entry;
}

async function main() {
  await loadEnvFiles();
  const today = new Date().toISOString().slice(0, 10);

  const pricesPath = path.join(process.cwd(), "data", "prices.json");
  const manualPath = path.join(process.cwd(), "data", "manual-prices.json");

  const pricesRaw = JSON.parse(await fs.readFile(pricesPath, "utf8")) as Record<
    string,
    unknown
  >;
  const manualRaw = JSON.parse(await fs.readFile(manualPath, "utf8")) as ManualPricesMap;

  const metaRaw = pricesRaw._meta as
    | { eurUsdRate?: number; ratesUpdatedAt?: string; usdRates?: PricesMeta["usdRates"] }
    | undefined;
  const meta: PricesMeta = {
    ratesUpdatedAt: metaRaw?.ratesUpdatedAt ?? today,
    ...(metaRaw?.usdRates
      ? { usdRates: metaRaw.usdRates }
      : typeof metaRaw?.eurUsdRate === "number" && metaRaw.eurUsdRate > 0
        ? { usdRates: { EUR: 1 / metaRaw.eurUsdRate } }
        : {}),
  };

  const entries: Record<string, PriceEntry> = {};
  const sources: Record<string, "pokewallet" | "manual"> = {};

  for (const [key, val] of Object.entries(pricesRaw)) {
    if (key === "_meta") continue;
    entries[key] = val as PriceEntry;
    sources[key] = "pokewallet";
  }

  for (const [cardId, manual] of Object.entries(manualRaw)) {
    entries[cardId] = mergeManualIntoEntry(entries[cardId], manual, today);
    sources[cardId] = "manual";
  }

  console.log(
    `Migrating ${Object.keys(entries).length} price rows (${Object.values(sources).filter((s) => s === "manual").length} manual)...`
  );

  await syncAllPricesToSheet(entries, sources, meta);

  console.log("Done. Prices tab seeded with meta row, headers, and data rows.");
  console.log("Verify in Google Sheets, then run fetch:prices for live updates.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

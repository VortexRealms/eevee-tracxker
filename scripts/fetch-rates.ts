/**
 * Update SQLite price_meta with current Frankfurter exchange rates only.
 * Run with: npm run fetch:rates
 */

import {
  exchangeRatesToMeta,
  fetchLiveExchangeRates,
  metaToExchangeRates,
} from "../lib/exchange-rates";
import { getPricesSnapshotFromDb, writePricesMetaToDb } from "../lib/price-db";
import { loadEnvFiles } from "./load-env";

async function main() {
  await loadEnvFiles();
  console.log("Fetching live exchange rates from Frankfurter...");
  const rates = await fetchLiveExchangeRates();
  const meta = exchangeRatesToMeta(rates);
  const existing = getPricesSnapshotFromDb();
  writePricesMetaToDb({ ...existing.meta, ...meta });
  const derived = metaToExchangeRates(meta);
  console.log(`Updated SQLite price_meta as of ${meta.ratesUpdatedAt}`);
  console.log(`  usdRates: ${JSON.stringify(meta.usdRates)}`);
  console.log(`  derived EUR/USD: ${derived.eurUsdRate.toFixed(4)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

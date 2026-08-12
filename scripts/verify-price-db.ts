/**
 * Verify git-tracked price SQLite integrity before daily publish.
 * Run with: npm run verify:price-db [-- YYYY-MM-DD]
 */

import { localTodayIso } from "../lib/fetch-price-skip";
import { verifyPriceDbIntegrity } from "../lib/price-db";

const expectedDate = process.argv[2] ?? localTodayIso();
const result = verifyPriceDbIntegrity(undefined, expectedDate);

console.log(`integrity_check: ${result.integrityCheck}`);
console.log(`has_meta: ${result.hasMeta}`);
console.log(`current_prices: ${result.currentPriceCount}`);
console.log(`latest_snapshot: ${result.latestSnapshotDate ?? "none"}`);

if (!result.ok) {
  for (const error of result.errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exit(1);
}

console.log("verify:price-db: ok");

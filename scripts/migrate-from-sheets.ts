/**
 * One-time migration from Google Sheets to Supabase (collection) + SQLite (prices).
 *
 * Run with: npm run migrate:from-sheets [-- --dry-run] [-- --replace-collection]
 */

import { buildCatalogueSlots } from "../lib/catalogue-slots";
import { getAllCards } from "../lib/cards";
import { countCollectionItems, replaceCollectionItemsForUser } from "../lib/db/collection";
import { requireAppUserId } from "../lib/db/config";
import { ensureAppUser } from "../lib/db/users";
import { localTodayIso } from "../lib/fetch-price-skip";
import {
  getAllCollectionRows,
  getAllPriceRows,
  getPricesMeta,
  getPricesSnapshot,
} from "../lib/google-sheets";
import { importAllPricesToDb, verifyPriceDbIntegrity } from "../lib/price-db";
import { loadEnvFiles } from "./load-env";
import { writePriceHistorySnapshot } from "./price-history-sqlite";

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
    replaceCollection: argv.includes("--replace-collection"),
  };
}

async function main() {
  await loadEnvFiles();
  const opts = parseArgs(process.argv.slice(2));
  const appUserId = requireAppUserId();
  const username = process.env.APP_USERNAME ?? "owner";

  console.log(`Migration mode: ${opts.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Target user: ${username} (${appUserId})`);

  const [sheetRows, sheetSnapshot] = await Promise.all([
    getAllCollectionRows(),
    getPricesSnapshot(),
  ]);

  const ownedRows = sheetRows.filter((row) => row.owned);
  const validSlotKeys = new Set(
    buildCatalogueSlots(getAllCards()).map((slot) => slot.slotKey)
  );

  const collectionItems = ownedRows
    .map((row) => {
      const colon = row.cardId.indexOf(":");
      const baseId = colon >= 0 ? row.cardId.slice(0, colon) : row.cardId;
      const variant = row.variant ?? (colon >= 0 ? row.cardId.slice(colon + 1) : "normal");
      return { cardId: baseId, variant, slotKey: `${baseId}:${variant}` };
    })
    .filter((item) => validSlotKeys.has(item.slotKey));

  const invalidOwned = ownedRows.length - collectionItems.length;

  console.log("\nSource (Google Sheets):");
  console.log(`  Owned collection rows: ${ownedRows.length}`);
  console.log(`  Valid catalogue slots: ${collectionItems.length}`);
  console.log(`  Invalid / stale slots: ${invalidOwned}`);
  console.log(`  Price entries: ${Object.keys(sheetSnapshot.entries).length}`);

  if (opts.dryRun) {
    console.log("\nDry run complete — no writes performed.");
    return;
  }

  await ensureAppUser({ id: appUserId, username });
  const importedCollection = await replaceCollectionItemsForUser(
    appUserId,
    collectionItems.map(({ cardId, variant }) => ({ cardId, variant })),
    { replace: opts.replaceCollection }
  );

  const sources: Record<string, "pokewallet" | "manual"> = {};
  const priceRows = await getAllPriceRows();
  for (const row of priceRows) {
    sources[row.cardId] = row.source === "manual" ? "manual" : "pokewallet";
  }

  const importedPrices = importAllPricesToDb(
    sheetSnapshot.entries,
    sources,
    sheetSnapshot.meta
  );

  const today = localTodayIso();
  const historyResult = writePriceHistorySnapshot({
    allCards: getAllCards(),
    snapshot: sheetSnapshot,
    observedDate: today,
  });

  const integrity = verifyPriceDbIntegrity(undefined, today);
  const collectionCount = await countCollectionItems(appUserId);

  console.log("\nDestination:");
  console.log(`  Supabase collection_items: ${collectionCount} (imported ${importedCollection})`);
  console.log(`  SQLite current_prices: ${importedPrices}`);
  console.log(
    `  SQLite price_history snapshot (${historyResult.observedDate}): ${historyResult.pointCount} points`
  );
  console.log(`  SQLite integrity: ${integrity.ok ? "ok" : integrity.errors.join("; ")}`);

  const meta = await getPricesMeta();
  console.log(`  FX meta ratesUpdatedAt: ${meta.ratesUpdatedAt}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

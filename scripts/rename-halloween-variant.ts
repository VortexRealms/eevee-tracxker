/**
 * One-time rename: variant key "halloween" -> "trickOrTrade" in SQLite price DB.
 * Run with: npx tsx scripts/rename-halloween-variant.ts
 */

import Database from "better-sqlite3";
import { withDbClient } from "../lib/db/postgres";
import { PRICE_DB_PATH } from "../lib/price-db-path";
import { loadEnvFiles } from "./load-env";

async function migrateSupabaseCollection(): Promise<number> {
  await loadEnvFiles();
  return withDbClient(async (client) => {
    const result = await client.query(
      `UPDATE collection_items
       SET variant = 'trickOrTrade', updated_at = NOW()
       WHERE variant = 'halloween'`
    );
    return result.rowCount ?? 0;
  });
}

function main() {
  const db = new Database(PRICE_DB_PATH);
  db.pragma("journal_mode = DELETE");

  const historyRows = db
    .prepare(`SELECT COUNT(*) AS c FROM price_history WHERE variant = 'halloween'`)
    .get() as { c: number };

  const renameHistory = db.prepare(`
    UPDATE price_history
    SET variant = 'trickOrTrade'
    WHERE variant = 'halloween'
  `);
  const historyResult = renameHistory.run();

  const currentRows = db
    .prepare(`SELECT card_id, variants_json FROM current_prices WHERE variants_json LIKE '%halloween%'`)
    .all() as Array<{ card_id: string; variants_json: string | null }>;

  let currentUpdated = 0;
  const updateCurrent = db.prepare(`
    UPDATE current_prices SET variants_json = @variants_json WHERE card_id = @card_id
  `);

  for (const row of currentRows) {
    if (!row.variants_json) continue;
    try {
      const variants = JSON.parse(row.variants_json) as Record<
        string,
        { usd?: number | null; eur?: number | null }
      >;
      if (!variants.halloween) continue;
      if (!variants.trickOrTrade) {
        variants.trickOrTrade = variants.halloween;
      }
      delete variants.halloween;
      updateCurrent.run({
        card_id: row.card_id,
        variants_json: JSON.stringify(variants),
      });
      currentUpdated++;
    } catch {
      /* skip corrupt json */
    }
  }

  console.log(`price_history rows with halloween before: ${historyRows.c}`);
  console.log(`price_history rows renamed: ${historyResult.changes}`);
  console.log(`current_prices rows updated: ${currentUpdated}`);
  db.close();
}

async function run() {
  main();
  try {
    const collectionRows = await migrateSupabaseCollection();
    console.log(`Supabase collection_items renamed: ${collectionRows}`);
  } catch (err) {
    console.warn(`Supabase collection migration skipped: ${(err as Error).message}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * One-time migration: reassign swshp-SWSH197 price history from normal/holo → playPokemon,
 * fix current_prices variants_json (remove incorrect holo slot). Idempotent.
 *
 * Run with: npx tsx scripts/migrate-swsh197-variant-prices.ts
 */

import Database from "better-sqlite3";
import path from "node:path";
import { PRICE_DB_PATH } from "../lib/price-db-path";

const CARD_ID = "swshp-SWSH197";
const FROM_VARIANTS = ["normal", "holo"] as const;
const TO_VARIANT = "playPokemon";

export function migrateSwsh197VariantPrices(db: Database.Database): {
  historyRenamed: number;
  historyConflictsDeleted: number;
  currentUpdated: boolean;
} {
  let historyRenamed = 0;
  let historyConflictsDeleted = 0;

  const listFrom = db.prepare(`
    SELECT variant, observed_date
    FROM price_history
    WHERE card_id = ? AND variant IN (${FROM_VARIANTS.map(() => "?").join(", ")})
    ORDER BY observed_date, variant
  `);

  const hasTarget = db.prepare(`
    SELECT 1 AS ok
    FROM price_history
    WHERE card_id = ? AND variant = ? AND observed_date = ?
  `);

  const renameRow = db.prepare(`
    UPDATE price_history
    SET variant = ?
    WHERE card_id = ? AND variant = ? AND observed_date = ?
  `);

  const deleteRow = db.prepare(`
    DELETE FROM price_history
    WHERE card_id = ? AND variant = ? AND observed_date = ?
  `);

  const migrateHistory = db.transaction(() => {
    const rows = listFrom.all(CARD_ID, ...FROM_VARIANTS) as Array<{
      variant: string;
      observed_date: string;
    }>;

    for (const row of rows) {
      const conflict = hasTarget.get(CARD_ID, TO_VARIANT, row.observed_date) as
        | { ok: 1 }
        | undefined;

      if (conflict) {
        deleteRow.run(CARD_ID, row.variant, row.observed_date);
        historyConflictsDeleted++;
      } else {
        renameRow.run(TO_VARIANT, CARD_ID, row.variant, row.observed_date);
        historyRenamed++;
      }
    }
  });

  migrateHistory();

  let currentUpdated = false;
  const current = db
    .prepare(`SELECT variants_json FROM current_prices WHERE card_id = ?`)
    .get(CARD_ID) as { variants_json: string | null } | undefined;

  if (current?.variants_json) {
    try {
      const variants = JSON.parse(current.variants_json) as Record<
        string,
        { usd?: number | null; eur?: number | null }
      >;

      const holo = variants.holo;
      const playPokemon = variants.playPokemon;
      const prizePackUsd = holo?.usd ?? null;

      if (holo && !playPokemon && prizePackUsd != null && prizePackUsd > 50) {
        variants.playPokemon = holo;
      } else if (holo && playPokemon && prizePackUsd != null && prizePackUsd > 50) {
        variants.playPokemon = holo;
      }

      delete variants.holo;
      delete variants.normal;

      db.prepare(`UPDATE current_prices SET variants_json = ? WHERE card_id = ?`).run(
        JSON.stringify(variants),
        CARD_ID
      );
      currentUpdated = true;
    } catch {
      /* skip corrupt json */
    }
  }

  return { historyRenamed, historyConflictsDeleted, currentUpdated };
}

function main() {
  const db = new Database(PRICE_DB_PATH);
  db.pragma("journal_mode = DELETE");

  const before = {
    normal: (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM price_history WHERE card_id = ? AND variant = 'normal'`
        )
        .get(CARD_ID) as { c: number }
    ).c,
    holo: (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM price_history WHERE card_id = ? AND variant = 'holo'`
        )
        .get(CARD_ID) as { c: number }
    ).c,
    playPokemon: (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM price_history WHERE card_id = ? AND variant = 'playPokemon'`
        )
        .get(CARD_ID) as { c: number }
    ).c,
  };

  const result = migrateSwsh197VariantPrices(db);

  const after = {
    normal: (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM price_history WHERE card_id = ? AND variant = 'normal'`
        )
        .get(CARD_ID) as { c: number }
    ).c,
    holo: (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM price_history WHERE card_id = ? AND variant = 'holo'`
        )
        .get(CARD_ID) as { c: number }
    ).c,
    playPokemon: (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM price_history WHERE card_id = ? AND variant = 'playPokemon'`
        )
        .get(CARD_ID) as { c: number }
    ).c,
  };

  console.log(`Migration for ${CARD_ID}:`);
  console.log(
    `  history before: normal=${before.normal}, holo=${before.holo}, playPokemon=${before.playPokemon}`
  );
  console.log(
    `  history renamed=${result.historyRenamed}, conflicts deleted=${result.historyConflictsDeleted}`
  );
  console.log(
    `  history after: normal=${after.normal}, holo=${after.holo}, playPokemon=${after.playPokemon}`
  );
  console.log(`  current_prices updated=${result.currentUpdated}`);

  db.close();
}

const isDirectRun =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  main();
}

/**
 * Undo broad holo-only migration damage:
 * - Restore price rows from git parent commit for all cards except the two intentional fixes
 * - Clear orphan flag on catalogue variant rows
 *
 * Run with: npx tsx scripts/repair-holo-merge-damage.ts
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import cardsData from "../data/cards.json";
import type { PokemonCard } from "../types";
import { PRICE_DB_PATH } from "../lib/price-db-path";

const KEEP_MIGRATED = new Set(["smp-SM240", "sm11-72"]);
const SOURCE_COMMIT = "a689646";

const cards = cardsData as PokemonCard[];
const catalogueVariants = new Map(
  cards.map((card) => [card.id, card.variants?.length ? card.variants : ["normal"]])
);

const tmpPath = path.join(os.tmpdir(), `price-repair-${Date.now()}.sqlite`);
const buffer = execSync(`git show ${SOURCE_COMMIT}:data/price-history.sqlite`, {
  encoding: "buffer",
  maxBuffer: 1024 * 1024 * 256,
});
fs.writeFileSync(tmpPath, buffer);

const source = new Database(tmpPath, { readonly: true });
const target = new Database(PRICE_DB_PATH);

try {
  const restoreIds = [...catalogueVariants.keys()].filter((id) => !KEEP_MIGRATED.has(id));

  const repair = target.transaction(() => {
    for (const cardId of restoreIds) {
      target
        .prepare(`DELETE FROM current_prices WHERE card_id = ?`)
        .run(cardId);
      target
        .prepare(`DELETE FROM price_history WHERE card_id = ?`)
        .run(cardId);

      const currentRows = source
        .prepare(`SELECT * FROM current_prices WHERE card_id = ?`)
        .all(cardId) as Array<Record<string, unknown>>;
      const insertCurrent = target.prepare(`
        INSERT INTO current_prices (
          card_id, variant, usd, eur, updated_at, source, price_kind,
          sample_count, metadata_json, orphan
        ) VALUES (
          @card_id, @variant, @usd, @eur, @updated_at, @source, @price_kind,
          @sample_count, @metadata_json, @orphan
        )
      `);
      for (const row of currentRows) insertCurrent.run(row);

      const historyRows = source
        .prepare(`SELECT * FROM price_history WHERE card_id = ?`)
        .all(cardId);
      const insertHistory = target.prepare(`
        INSERT INTO price_history (
          card_id, variant, observed_date, usd, eur, source, source_updated_at, recorded_at
        ) VALUES (
          @card_id, @variant, @observed_date, @usd, @eur, @source, @source_updated_at, @recorded_at
        )
      `);
      for (const row of historyRows) insertHistory.run(row);
    }

    for (const [cardId, variants] of catalogueVariants) {
      target
        .prepare(
          `UPDATE current_prices SET orphan = 0 WHERE card_id = ? AND variant IN (${variants
            .map(() => "?")
            .join(",")})`
        )
        .run(cardId, ...variants);
    }
  });

  repair();
  console.log(`Restored price data for ${restoreIds.length} card(s) from ${SOURCE_COMMIT}`);
  console.log(`Kept migrated pricing for: ${[...KEEP_MIGRATED].join(", ")}`);

  const base23 = target
    .prepare(
      `SELECT variant, usd, eur, orphan FROM current_prices WHERE card_id = 'base2-3' ORDER BY variant`
    )
    .all();
  console.log("base2-3 after repair:", base23);
} finally {
  source.close();
  target.close();
  fs.unlinkSync(tmpPath);
}

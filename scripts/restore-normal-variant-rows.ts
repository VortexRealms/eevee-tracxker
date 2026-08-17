/**
 * Restore normal variant DB rows for cards that were bulk-changed by mistake.
 * Keeps smp-SM240 and sm11-72 as holo-only fixes.
 *
 * Run with: npx tsx scripts/restore-normal-variant-rows.ts
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { PRICE_DB_PATH } from "../lib/price-db-path";

const RESTORE_CARD_IDS = [
  "smp-SM35",
  "smp-SM36",
  "smp-SM171",
  "smp-SM172",
  "smp-SM173",
  "smp-SM174",
  "smp-SM175",
  "smp-SM241",
  "swshp-SWSH180",
  "swshp-SWSH182",
  "swshp-SWSH184",
];

const tmpPath = path.join(os.tmpdir(), `price-history-restore-${Date.now()}.sqlite`);
const buffer = execSync(`git show HEAD:data/price-history.sqlite`, {
  encoding: "buffer",
  maxBuffer: 1024 * 1024 * 256,
});
fs.writeFileSync(tmpPath, buffer);

const source = new Database(tmpPath, { readonly: true });
const target = new Database(PRICE_DB_PATH);

try {
  const restore = target.transaction(() => {
    for (const cardId of RESTORE_CARD_IDS) {
      target
        .prepare(`DELETE FROM current_prices WHERE card_id = ? AND variant IN ('normal', 'holo')`)
        .run(cardId);
      target
        .prepare(`DELETE FROM price_history WHERE card_id = ? AND variant IN ('normal', 'holo')`)
        .run(cardId);

      const currentRows = source
        .prepare(
          `SELECT card_id, variant, usd, eur, updated_at, source, price_kind, sample_count, metadata_json, orphan
           FROM current_prices WHERE card_id = ? AND variant IN ('normal', 'holo')`
        )
        .all(cardId);
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
        .prepare(
          `SELECT card_id, variant, observed_date, usd, eur, source, source_updated_at, recorded_at
           FROM price_history WHERE card_id = ? AND variant IN ('normal', 'holo')`
        )
        .all(cardId);
      const insertHistory = target.prepare(`
        INSERT INTO price_history (
          card_id, variant, observed_date, usd, eur, source, source_updated_at, recorded_at
        ) VALUES (
          @card_id, @variant, @observed_date, @usd, @eur, @source, @source_updated_at, @recorded_at
        )
      `);
      for (const row of historyRows) insertHistory.run(row);

      console.log(
        `${cardId}: restored ${currentRows.length} current row(s), ${historyRows.length} history row(s)`
      );
    }
  });

  restore();
} finally {
  source.close();
  target.close();
  fs.unlinkSync(tmpPath);
}

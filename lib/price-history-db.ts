/**
 * Read-only access to the committed local SQLite price history snapshots.
 * Used by the /api/price-history route to power the card detail chart.
 * The writer (CLI-only) lives in scripts/price-history-sqlite.ts.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const PRICE_HISTORY_DB_PATH = path.join(
  process.cwd(),
  "data",
  "price-history.sqlite"
);

export interface PriceHistoryPoint {
  date: string;
  usd: number | null;
  eur: number | null;
}

/**
 * Ascending-by-date price points for one card/variant over the trailing
 * `days` calendar days (by observed_date, not wall-clock elapsed time).
 */
export function getPriceHistorySeries(
  cardId: string,
  variant: string,
  days = 30
): PriceHistoryPoint[] {
  if (!fs.existsSync(PRICE_HISTORY_DB_PATH)) return [];

  const db = new Database(PRICE_HISTORY_DB_PATH, { readonly: true });
  try {
    const rows = db
      .prepare(
        `SELECT observed_date AS date, usd, eur
         FROM price_history
         WHERE card_id = ? AND variant = ?
           AND observed_date >= date('now', ?)
         ORDER BY observed_date ASC`
      )
      .all(cardId, variant, `-${days} days`) as PriceHistoryPoint[];
    return rows;
  } finally {
    db.close();
  }
}

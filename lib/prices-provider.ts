/**
 * Price snapshot provider: SQLite primary, optional Google Sheets fallback during cutover.
 */

import { getPricesSnapshot as getPricesSnapshotFromSheets } from "./google-sheets";
import { getPricesSnapshotFromDb } from "./price-db";
import type { PricesSnapshot } from "../types";

export async function getPricesSnapshot(): Promise<PricesSnapshot> {
  const fromDb = getPricesSnapshotFromDb();
  const hasDbPrices = Object.keys(fromDb.entries).length > 0;

  if (hasDbPrices) {
    return fromDb;
  }

  if (process.env.USE_GOOGLE_SHEETS_FALLBACK === "true") {
    return getPricesSnapshotFromSheets();
  }

  return fromDb;
}

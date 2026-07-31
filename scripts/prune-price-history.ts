/**
 * Standalone retention prune for data/price-history.sqlite.
 *
 * Run with:
 *   npm run prune:price-history
 *   npm run prune:price-history -- --dry-run
 *   npm run prune:price-history -- --days 31
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { localTodayIso } from "../lib/fetch-price-skip";
import { PRICE_HISTORY_RETENTION_DAYS } from "../lib/price-history-retention";
import {
  DEFAULT_PRICE_HISTORY_DB_PATH,
  prunePriceHistory,
} from "./price-history-sqlite";

function parseArgs(argv: string[]): {
  dryRun: boolean;
  days: number;
  dbPath: string;
  referenceDate: string;
} {
  let dryRun = false;
  let days = PRICE_HISTORY_RETENTION_DAYS;
  let dbPath = DEFAULT_PRICE_HISTORY_DB_PATH;
  let referenceDate = localTodayIso();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--days" && argv[i + 1]) {
      days = Math.max(1, parseInt(argv[++i], 10) || days);
    } else if (arg === "--db" && argv[i + 1]) {
      dbPath = argv[++i];
    } else if (arg === "--date" && argv[i + 1]) {
      referenceDate = argv[++i];
    }
  }

  return { dryRun, days, dbPath, referenceDate };
}

function countDistinctDates(dbPath: string): number {
  if (!fs.existsSync(dbPath)) return 0;
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .prepare(`SELECT COUNT(DISTINCT observed_date) AS c FROM price_history`)
      .get() as { c: number };
    return row.c;
  } finally {
    db.close();
  }
}

function fileSizeBytes(dbPath: string): number {
  if (!fs.existsSync(dbPath)) return 0;
  return fs.statSync(dbPath).size;
}

async function main() {
  const { dryRun, days, dbPath, referenceDate } = parseArgs(process.argv.slice(2));
  const sizeBefore = fileSizeBytes(dbPath);
  const datesBefore = countDistinctDates(dbPath);

  console.log(
    `${dryRun ? "Dry-run" : "Pruning"} price history (keep ${days} calendar date(s), reference ${referenceDate})`
  );
  console.log(`  DB: ${dbPath}`);

  const result = prunePriceHistory({
    dbPath,
    referenceDate,
    retentionDays: days,
    dryRun,
  });

  const sizeAfter = dryRun ? sizeBefore : fileSizeBytes(dbPath);
  const datesAfter = dryRun ? datesBefore : countDistinctDates(dbPath);

  console.log(`  Cutoff (delete strictly before): ${result.cutoffDate}`);
  console.log(
    `  ${dryRun ? "Would delete" : "Deleted"}: ${result.deletedPoints} point(s), ${result.deletedRuns} run(s)`
  );
  if (!dryRun && result.vacuumed) {
    console.log("  VACUUM completed");
  }
  console.log(`  Distinct dates: ${datesBefore} -> ${datesAfter}`);
  console.log(`  File size: ${sizeBefore} -> ${sizeAfter} bytes`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

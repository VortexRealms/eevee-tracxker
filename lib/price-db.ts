/**
 * Read/write access to current prices and FX metadata in the git-tracked SQLite file.
 * Price history tables are written by scripts/price-history-sqlite.ts.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { PriceEntry, PricesMeta, PricesSnapshot } from "../types";
import {
  metaToExchangeRates,
  parseUsdRatesJson,
  serializeUsdRatesJson,
} from "./exchange-rates";
import { mergePriceEntries } from "./price-merge";
import { normalizePriceEntry } from "./price-entry-utils";
import { PRICE_DB_SCHEMA_SQL } from "./price-db-schema";
import { PRICE_DB_PATH } from "./price-db-path";

export { PRICE_DB_PATH };

export interface SyncPricesResult {
  updated: number;
  skipped: number;
  appended: number;
}

export interface PriceDbIntegrityResult {
  ok: boolean;
  integrityCheck: string;
  hasMeta: boolean;
  currentPriceCount: number;
  latestSnapshotDate: string | null;
  errors: string[];
}

function sanitizeVariantPrices(
  variants: PriceEntry["variants"]
): PriceEntry["variants"] | undefined {
  if (!variants) return undefined;
  const out: NonNullable<PriceEntry["variants"]> = {};
  for (const [key, prices] of Object.entries(variants)) {
    if (!prices || typeof prices !== "object") continue;
    out[key] = { usd: prices.usd ?? null, eur: prices.eur ?? null };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function rowToEntry(row: {
  usd: number | null;
  eur: number | null;
  updated_at: string;
  variants_json: string | null;
  source: string;
}): PriceEntry {
  let variants: PriceEntry["variants"];
  if (row.variants_json) {
    try {
      variants = sanitizeVariantPrices(
        JSON.parse(row.variants_json) as PriceEntry["variants"]
      );
    } catch {
      variants = undefined;
    }
  }
  return normalizePriceEntry({
    usd: row.usd,
    eur: row.eur,
    updatedAt: row.updated_at,
    source: row.source === "manual" ? "manual" : "pokewallet",
    ...(variants ? { variants } : {}),
  });
}

function entryToDbRow(cardId: string, entry: PriceEntry, source: "pokewallet" | "manual") {
  const variantsJson =
    entry.variants && Object.keys(entry.variants).length > 0
      ? JSON.stringify(entry.variants)
      : null;
  return {
    card_id: cardId,
    usd: entry.usd ?? null,
    eur: entry.eur ?? null,
    updated_at: entry.updatedAt,
    variants_json: variantsJson,
    source,
  };
}

export function openPriceDb(
  dbPath = PRICE_DB_PATH,
  options: { readonly?: boolean } = {}
): Database.Database {
  const dir = path.dirname(dbPath);
  if (!options.readonly && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath, options);
  if (!options.readonly) {
    db.pragma("journal_mode = DELETE");
    db.exec(PRICE_DB_SCHEMA_SQL);
  }
  return db;
}

export function getPricesSnapshotFromDb(dbPath = PRICE_DB_PATH): PricesSnapshot {
  if (!fs.existsSync(dbPath)) {
    return { meta: { ratesUpdatedAt: new Date().toISOString().slice(0, 10) }, entries: {} };
  }

  const db = openPriceDb(dbPath, { readonly: true });
  try {
    const metaRow = db
      .prepare(`SELECT rates_updated_at, usd_rates_json FROM price_meta WHERE id = 1`)
      .get() as { rates_updated_at: string; usd_rates_json: string } | undefined;

    const meta: PricesMeta = metaRow
      ? {
          ratesUpdatedAt: metaRow.rates_updated_at,
          ...(parseUsdRatesJson(metaRow.usd_rates_json)
            ? { usdRates: parseUsdRatesJson(metaRow.usd_rates_json) }
            : {}),
        }
      : { ratesUpdatedAt: new Date().toISOString().slice(0, 10) };

    const rows = db
      .prepare(
        `SELECT card_id, usd, eur, updated_at, variants_json, source FROM current_prices`
      )
      .all() as Array<{
      card_id: string;
      usd: number | null;
      eur: number | null;
      updated_at: string;
      variants_json: string | null;
      source: string;
    }>;

    const entries: Record<string, PriceEntry> = {};
    for (const row of rows) {
      entries[row.card_id] = rowToEntry(row);
    }
    return { meta, entries };
  } finally {
    db.close();
  }
}

export function writePricesMetaToDb(
  meta: PricesMeta,
  dbOrPath: Database.Database | string = PRICE_DB_PATH
): void {
  const rates = metaToExchangeRates(meta);
  const params = {
    rates_updated_at: rates.ratesUpdatedAt,
    usd_rates_json: serializeUsdRatesJson(rates.usdRates),
  };
  const sql = `INSERT INTO price_meta (id, rates_updated_at, usd_rates_json)
       VALUES (1, @rates_updated_at, @usd_rates_json)
       ON CONFLICT (id) DO UPDATE SET
         rates_updated_at = excluded.rates_updated_at,
         usd_rates_json = excluded.usd_rates_json`;

  if (typeof dbOrPath === "string") {
    const db = openPriceDb(dbOrPath);
    try {
      db.prepare(sql).run(params);
    } finally {
      db.close();
    }
    return;
  }

  dbOrPath.prepare(sql).run(params);
}

/**
 * Sync fetched prices into SQLite. Skips rows with source=manual (same as Sheet sync).
 */
export function syncPricesToDb(
  entries: Record<string, PriceEntry>,
  meta: PricesMeta,
  dbPath = PRICE_DB_PATH
): SyncPricesResult {
  const db = openPriceDb(dbPath);
  try {
    writePricesMetaToDb(meta, db);

    const existingRows = db
      .prepare(
        `SELECT card_id, usd, eur, updated_at, variants_json, source FROM current_prices`
      )
      .all() as Array<{
      card_id: string;
      usd: number | null;
      eur: number | null;
      updated_at: string;
      variants_json: string | null;
      source: string;
    }>;
    const existingEntries: Record<string, PriceEntry> = {};
    for (const row of existingRows) {
      existingEntries[row.card_id] = rowToEntry(row);
    }

    const upsert = db.prepare(`
      INSERT INTO current_prices (card_id, usd, eur, updated_at, variants_json, source)
      VALUES (@card_id, @usd, @eur, @updated_at, @variants_json, @source)
      ON CONFLICT (card_id) DO UPDATE SET
        usd = excluded.usd,
        eur = excluded.eur,
        updated_at = excluded.updated_at,
        variants_json = excluded.variants_json,
        source = excluded.source
    `);

    let updated = 0;
    let appended = 0;
    let skipped = 0;

    const syncAll = db.transaction(() => {
      for (const [cardId, entry] of Object.entries(entries)) {
        if (existingEntries[cardId]?.source === "manual") {
          skipped++;
          continue;
        }
        const merged = mergePriceEntries(entry, existingEntries[cardId]);
        const hadRow = cardId in existingEntries;
        upsert.run(entryToDbRow(cardId, merged, "pokewallet"));
        if (hadRow) updated++;
        else appended++;
      }
    });

    syncAll();
    return { updated, skipped, appended };
  } finally {
    db.close();
  }
}

/** Full replace for migration from Google Sheets. */
export function importAllPricesToDb(
  entries: Record<string, PriceEntry>,
  sources: Record<string, "pokewallet" | "manual">,
  meta: PricesMeta,
  dbPath = PRICE_DB_PATH
): number {
  const db = openPriceDb(dbPath);
  try {
    writePricesMetaToDb(meta, dbPath);
    db.prepare(`DELETE FROM current_prices`).run();

    const insert = db.prepare(`
      INSERT INTO current_prices (card_id, usd, eur, updated_at, variants_json, source)
      VALUES (@card_id, @usd, @eur, @updated_at, @variants_json, @source)
    `);

    const importAll = db.transaction(() => {
      for (const [cardId, entry] of Object.entries(entries)) {
        insert.run(entryToDbRow(cardId, entry, sources[cardId] ?? "pokewallet"));
      }
    });
    importAll();
    return Object.keys(entries).length;
  } finally {
    db.close();
  }
}

export function verifyPriceDbIntegrity(
  dbPath = PRICE_DB_PATH,
  expectedSnapshotDate?: string
): PriceDbIntegrityResult {
  const errors: string[] = [];
  if (!fs.existsSync(dbPath)) {
    return {
      ok: false,
      integrityCheck: "missing",
      hasMeta: false,
      currentPriceCount: 0,
      latestSnapshotDate: null,
      errors: ["Price database file is missing"],
    };
  }

  const db = openPriceDb(dbPath, { readonly: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true }) as string;
    if (integrity !== "ok") {
      errors.push(`integrity_check failed: ${integrity}`);
    }

    const metaRow = db
      .prepare(`SELECT 1 AS ok FROM price_meta WHERE id = 1`)
      .get() as { ok: number } | undefined;
    const hasMeta = Boolean(metaRow);

    const countRow = db
      .prepare(`SELECT COUNT(*) AS c FROM current_prices`)
      .get() as { c: number };

    const latestRun = db
      .prepare(`SELECT observed_date FROM snapshot_runs ORDER BY observed_date DESC LIMIT 1`)
      .get() as { observed_date: string } | undefined;

    if (expectedSnapshotDate) {
      const todayRun = db
        .prepare(`SELECT 1 AS ok FROM snapshot_runs WHERE observed_date = ?`)
        .get(expectedSnapshotDate) as { ok: number } | undefined;
      if (!todayRun) {
        errors.push(`Missing snapshot_runs row for ${expectedSnapshotDate}`);
      }
    }

    return {
      ok: errors.length === 0,
      integrityCheck: integrity,
      hasMeta,
      currentPriceCount: countRow.c,
      latestSnapshotDate: latestRun?.observed_date ?? null,
      errors,
    };
  } finally {
    db.close();
  }
}

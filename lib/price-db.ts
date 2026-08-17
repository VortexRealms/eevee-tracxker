/**
 * Read/write access to current prices and FX metadata in the git-tracked SQLite file.
 * Price history tables are written by scripts/price-history-sqlite.ts.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type {
  PriceEntry,
  PriceKind,
  PriceSource,
  PricesMeta,
  PricesSnapshot,
} from "../types";
import {
  metaToExchangeRates,
  parseUsdRatesJson,
  serializeUsdRatesJson,
} from "./exchange-rates";
import { mergePriceEntries } from "./price-merge";
import { normalizePriceEntry } from "./price-entry-utils";
import {
  CURRENT_PRICES_V1_SQL,
  PRICE_DB_SCHEMA_SQL,
  PRICE_DB_USER_VERSION,
} from "./price-db-schema";
import { PRICE_DB_PATH } from "./price-db-path";
import {
  expandEntryToVariantRows,
  groupVariantRowsToEntries,
  mergeVariantRecords,
  type VariantPriceRow,
} from "./variant-price-contract";

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
  schemaVersion: number;
  errors: string[];
}

function parseMetadataJson(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function rowToVariantRow(row: {
  card_id: string;
  variant: string;
  usd: number | null;
  eur: number | null;
  updated_at: string;
  source: string;
  price_kind: string;
  sample_count: number | null;
  metadata_json: string | null;
  orphan: number;
}): VariantPriceRow {
  const source = row.source as PriceSource;
  return {
    cardId: row.card_id,
    variant: row.variant,
    usd: row.usd,
    eur: row.eur,
    updatedAt: row.updated_at,
    source,
    priceKind: row.price_kind as PriceKind,
    sampleCount: row.sample_count,
    metadata: parseMetadataJson(row.metadata_json),
    orphan: row.orphan === 1,
  };
}

function legacyRowToEntry(row: {
  usd: number | null;
  eur: number | null;
  updated_at: string;
  variants_json: string | null;
  source: string;
}): PriceEntry {
  let variants: PriceEntry["variants"];
  if (row.variants_json) {
    try {
      variants = JSON.parse(row.variants_json) as PriceEntry["variants"];
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

function variantRowToDbParams(row: VariantPriceRow) {
  return {
    card_id: row.cardId,
    variant: row.variant,
    usd: row.usd,
    eur: row.eur,
    updated_at: row.updatedAt,
    source: row.source,
    price_kind: row.priceKind,
    sample_count: row.sampleCount ?? null,
    metadata_json: row.metadata ? JSON.stringify(row.metadata) : null,
    orphan: row.orphan ? 1 : 0,
  };
}

export function readVariantPriceRows(db: Database.Database): VariantPriceRow[] {
  const rows = db
    .prepare(
      `SELECT card_id, variant, usd, eur, updated_at, source, price_kind,
              sample_count, metadata_json, orphan
       FROM current_prices`
    )
    .all() as Array<Parameters<typeof rowToVariantRow>[0]>;
  return rows.map(rowToVariantRow);
}

export function getSchemaVersion(db: Database.Database): number {
  return (db.pragma("user_version", { simple: true }) as number) ?? 0;
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { ok: number } | undefined;
  return Boolean(row);
}

function isLegacyCurrentPrices(db: Database.Database): boolean {
  if (!tableExists(db, "current_prices")) return false;
  const cols = db.prepare(`PRAGMA table_info(current_prices)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === "variants_json");
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
    const version = getSchemaVersion(db);
    if (version === 0 && !isLegacyCurrentPrices(db)) {
      db.pragma(`user_version = ${PRICE_DB_USER_VERSION}`);
    }
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

    const version = getSchemaVersion(db);
    if (version >= PRICE_DB_USER_VERSION && !isLegacyCurrentPrices(db)) {
      const rows = readVariantPriceRows(db);
      return { meta, entries: groupVariantRowsToEntries(rows) };
    }

    const legacyRows = db
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
    for (const row of legacyRows) {
      entries[row.card_id] = legacyRowToEntry(row);
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

export function syncVariantRowsToDb(
  rows: VariantPriceRow[],
  meta: PricesMeta,
  dbOrPath: Database.Database | string = PRICE_DB_PATH
): SyncPricesResult {
  const ownsDb = typeof dbOrPath === "string";
  const db = ownsDb ? openPriceDb(dbOrPath) : dbOrPath;
  try {
    writePricesMetaToDb(meta, db);

    const existing = readVariantPriceRows(db);
    const existingByKey = new Map(
      existing.map((row) => [`${row.cardId}\0${row.variant}`, row])
    );

    const upsert = db.prepare(`
      INSERT INTO current_prices (
        card_id, variant, usd, eur, updated_at, source, price_kind,
        sample_count, metadata_json, orphan
      ) VALUES (
        @card_id, @variant, @usd, @eur, @updated_at, @source, @price_kind,
        @sample_count, @metadata_json, @orphan
      )
      ON CONFLICT (card_id, variant) DO UPDATE SET
        usd = excluded.usd,
        eur = excluded.eur,
        updated_at = excluded.updated_at,
        source = excluded.source,
        price_kind = excluded.price_kind,
        sample_count = excluded.sample_count,
        metadata_json = excluded.metadata_json,
        orphan = excluded.orphan
    `);

    let updated = 0;
    let appended = 0;
    let skipped = 0;

    const syncAll = db.transaction(() => {
      for (const row of rows) {
        const key = `${row.cardId}\0${row.variant}`;
        const prior = existingByKey.get(key);
        if (prior?.source === "manual") {
          skipped++;
          continue;
        }
        const hadRow = Boolean(prior);
        upsert.run(variantRowToDbParams(row));
        if (hadRow) updated++;
        else appended++;
      }
    });

    syncAll();
    return { updated, skipped, appended };
  } finally {
    if (ownsDb) db.close();
  }
}

/**
 * Sync fetched prices into SQLite. Skips variant rows with source=manual.
 * Accepts card-level PriceEntry snapshot and expands to variant rows.
 */
export function syncPricesToDb(
  entries: Record<string, PriceEntry>,
  meta: PricesMeta,
  catalogueVariantsByCard: Record<string, string[]> = {},
  dbPath = PRICE_DB_PATH
): SyncPricesResult {
  const existingSnapshot = getPricesSnapshotFromDb(dbPath);
  const existingEntries = existingSnapshot.entries;

  const mergedRows: VariantPriceRow[] = [];
  let manualSkipped = 0;

  for (const [cardId, entry] of Object.entries(entries)) {
    const prior = existingEntries[cardId];
    const merged = mergePriceEntries(entry, prior);
    const catalogueVariants = catalogueVariantsByCard[cardId] ?? [];
    const expanded = expandEntryToVariantRows(cardId, merged, catalogueVariants, {
      includeOrphans: true,
    });

    for (const row of expanded) {
      const priorVariant = prior?.variants?.[row.variant];
      if (priorVariant?.source === "manual") {
        manualSkipped++;
        continue;
      }
      const mergedRecord = mergeVariantRecords(
        {
          usd: row.usd,
          eur: row.eur,
          updatedAt: row.updatedAt,
          source: row.source,
          priceKind: row.priceKind,
          sampleCount: row.sampleCount ?? undefined,
          metadata: row.metadata,
        },
        priorVariant
      );
      mergedRows.push({
        ...row,
        usd: mergedRecord.usd ?? null,
        eur: mergedRecord.eur ?? null,
        updatedAt: mergedRecord.updatedAt ?? row.updatedAt,
        source: mergedRecord.source ?? row.source,
        priceKind: mergedRecord.priceKind ?? row.priceKind,
        sampleCount: mergedRecord.sampleCount ?? row.sampleCount ?? null,
        metadata: mergedRecord.metadata ?? row.metadata,
      });
    }
  }

  const result = syncVariantRowsToDb(mergedRows, meta, dbPath);
  return { ...result, skipped: result.skipped + manualSkipped };
}

/** Full replace for migration from Google Sheets. */
export function importAllPricesToDb(
  entries: Record<string, PriceEntry>,
  sources: Record<string, PriceSource>,
  meta: PricesMeta,
  catalogueVariantsByCard: Record<string, string[]> = {},
  dbPath = PRICE_DB_PATH
): number {
  const db = openPriceDb(dbPath);
  try {
    writePricesMetaToDb(meta, db);
    db.prepare(`DELETE FROM current_prices`).run();

    const insert = db.prepare(`
      INSERT INTO current_prices (
        card_id, variant, usd, eur, updated_at, source, price_kind,
        sample_count, metadata_json, orphan
      ) VALUES (
        @card_id, @variant, @usd, @eur, @updated_at, @source, @price_kind,
        @sample_count, @metadata_json, @orphan
      )
    `);

    let count = 0;
    const importAll = db.transaction(() => {
      for (const [cardId, entry] of Object.entries(entries)) {
        const cardSource = sources[cardId] ?? entry.source ?? "pokewallet";
        const catalogueVariants = catalogueVariantsByCard[cardId] ?? [];
        const rows = expandEntryToVariantRows(
          cardId,
          { ...entry, source: cardSource },
          catalogueVariants,
          { includeOrphans: true }
        );
        for (const row of rows) {
          insert.run(variantRowToDbParams(row));
          count++;
        }
      }
    });
    importAll();
    db.pragma(`user_version = ${PRICE_DB_USER_VERSION}`);
    return count;
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
      schemaVersion: 0,
      errors: ["Price database file is missing"],
    };
  }

  const db = openPriceDb(dbPath, { readonly: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true }) as string;
    if (integrity !== "ok") {
      errors.push(`integrity_check failed: ${integrity}`);
    }

    const schemaVersion = getSchemaVersion(db);
    if (schemaVersion < PRICE_DB_USER_VERSION && isLegacyCurrentPrices(db)) {
      errors.push(
        `Schema user_version=${schemaVersion}; expected ${PRICE_DB_USER_VERSION} (run migrate:current-prices)`
      );
    }

    const metaRow = db
      .prepare(`SELECT 1 AS ok FROM price_meta WHERE id = 1`)
      .get() as { ok: number } | undefined;
    const hasMeta = Boolean(metaRow);

    const countRow = db
      .prepare(`SELECT COUNT(*) AS c FROM current_prices`)
      .get() as { c: number };

    const duplicateRows = db
      .prepare(
        `SELECT card_id, variant, COUNT(*) AS c
         FROM current_prices
         GROUP BY card_id, variant
         HAVING c > 1`
      )
      .all() as Array<{ card_id: string; variant: string; c: number }>;
    if (duplicateRows.length > 0) {
      errors.push(`Duplicate current_prices keys: ${duplicateRows.length}`);
    }

    const invalidSource = db
      .prepare(
        `SELECT COUNT(*) AS c FROM current_prices
         WHERE source NOT IN ('pokewallet', 'ebay', 'manual')`
      )
      .get() as { c: number };
    if (invalidSource.c > 0) {
      errors.push(`Invalid current_prices source values: ${invalidSource.c}`);
    }

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
      schemaVersion,
      errors,
    };
  } finally {
    db.close();
  }
}

export { CURRENT_PRICES_V1_SQL, PRICE_DB_USER_VERSION };

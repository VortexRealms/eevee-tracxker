/**
 * Local SQLite daily price history snapshots.
 * Written after successful fetch:prices Sheet sync; read-only on Vercel in a later phase.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getPriceForCard } from "../lib/cards";
import { PRICE_HISTORY_RETENTION_DAYS } from "../lib/price-history-retention";
import { PRICE_DB_SCHEMA_SQL } from "../lib/price-db-schema";
import { PRICE_DB_PATH } from "../lib/price-db-path";
import type { PokemonCard, PricesSnapshot } from "../types";

export const DEFAULT_PRICE_HISTORY_DB_PATH = PRICE_DB_PATH;

export interface PriceHistoryPruneResult {
  cutoffDate: string;
  deletedPoints: number;
  deletedRuns: number;
  vacuumed: boolean;
}

export interface PriceHistorySnapshotResult {
  dbPath: string;
  observedDate: string;
  recordedAt: string;
  pointCount: number;
  inserted: number;
  updated: number;
  prune?: PriceHistoryPruneResult;
}

const SCHEMA_SQL = PRICE_DB_SCHEMA_SQL;

function ensureDataDir(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function openHistoryDb(dbPath: string): Database.Database {
  ensureDataDir(dbPath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = DELETE");
  db.exec(SCHEMA_SQL);
  return db;
}

function catalogueVariants(card: PokemonCard): string[] {
  return card.variants?.length ? card.variants : ["normal"];
}

function hasNativePrice(usd: number | null, eur: number | null): boolean {
  return usd != null || eur != null;
}

function computeCutoffDate(
  db: Database.Database,
  referenceDate: string,
  retentionDays: number
): string {
  const row = db
    .prepare(`SELECT date(?, ?) AS cutoff`)
    .get(referenceDate, `-${retentionDays - 1} days`) as { cutoff: string };
  return row.cutoff;
}

export interface PrunePriceHistoryInput {
  referenceDate: string;
  retentionDays?: number;
  dryRun?: boolean;
}

/**
 * Delete price_history and snapshot_runs rows older than the retention window.
 * When dryRun is true, reports counts without deleting or vacuuming.
 */
export function prunePriceHistoryOnDb(
  db: Database.Database,
  input: PrunePriceHistoryInput
): PriceHistoryPruneResult {
  const retentionDays = input.retentionDays ?? PRICE_HISTORY_RETENTION_DAYS;
  const cutoffDate = computeCutoffDate(db, input.referenceDate, retentionDays);

  const countPoints = db
    .prepare(`SELECT COUNT(*) AS c FROM price_history WHERE observed_date < ?`)
    .get(cutoffDate) as { c: number };
  const countRuns = db
    .prepare(`SELECT COUNT(*) AS c FROM snapshot_runs WHERE observed_date < ?`)
    .get(cutoffDate) as { c: number };

  if (input.dryRun) {
    return {
      cutoffDate,
      deletedPoints: countPoints.c,
      deletedRuns: countRuns.c,
      vacuumed: false,
    };
  }

  const deletePoints = db.prepare(
    `DELETE FROM price_history WHERE observed_date < @cutoff`
  );
  const deleteRuns = db.prepare(
    `DELETE FROM snapshot_runs WHERE observed_date < @cutoff`
  );

  let deletedPoints = 0;
  let deletedRuns = 0;

  const prune = db.transaction(() => {
    deletedPoints = deletePoints.run({ cutoff: cutoffDate }).changes;
    deletedRuns = deleteRuns.run({ cutoff: cutoffDate }).changes;
  });
  prune();

  const vacuumed = deletedPoints + deletedRuns > 0;
  if (vacuumed) {
    db.exec("VACUUM");
  }

  return {
    cutoffDate,
    deletedPoints,
    deletedRuns,
    vacuumed,
  };
}

/** Open DB, prune, close. Used by standalone script and when not reusing a connection. */
export function prunePriceHistory(input: {
  dbPath?: string;
  referenceDate: string;
  retentionDays?: number;
  dryRun?: boolean;
}): PriceHistoryPruneResult {
  const dbPath = input.dbPath ?? DEFAULT_PRICE_HISTORY_DB_PATH;
  const retentionDays = input.retentionDays ?? PRICE_HISTORY_RETENTION_DAYS;

  if (!fs.existsSync(dbPath)) {
    const mem = new Database(":memory:");
    try {
      const cutoffDate = computeCutoffDate(mem, input.referenceDate, retentionDays);
      return {
        cutoffDate,
        deletedPoints: 0,
        deletedRuns: 0,
        vacuumed: false,
      };
    } finally {
      mem.close();
    }
  }

  const db = input.dryRun
    ? new Database(dbPath, { readonly: true })
    : openHistoryDb(dbPath);

  try {
    return prunePriceHistoryOnDb(db, {
      referenceDate: input.referenceDate,
      retentionDays: input.retentionDays,
      dryRun: input.dryRun,
    });
  } finally {
    db.close();
  }
}

/**
 * Snapshot resolved USD/EUR prices for every catalogue variant into SQLite.
 * Same-day reruns upsert rows (idempotent). Missing currencies stay NULL.
 */
export function writePriceHistorySnapshot(input: {
  allCards: PokemonCard[];
  snapshot: PricesSnapshot;
  observedDate: string;
  dbPath?: string;
  retentionDays?: number;
}): PriceHistorySnapshotResult {
  const dbPath = input.dbPath ?? DEFAULT_PRICE_HISTORY_DB_PATH;
  const recordedAt = new Date().toISOString();
  const db = openHistoryDb(dbPath);

  const existingKeys = new Set<string>();
  const existingRows = db
    .prepare(
      `SELECT card_id, variant FROM price_history WHERE observed_date = ?`
    )
    .all(input.observedDate) as Array<{ card_id: string; variant: string }>;

  for (const row of existingRows) {
    existingKeys.add(`${row.card_id}\0${row.variant}`);
  }

  const upsert = db.prepare(`
    INSERT INTO price_history (
      card_id, variant, observed_date, usd, eur, source, source_updated_at, recorded_at
    ) VALUES (
      @card_id, @variant, @observed_date, @usd, @eur, @source, @source_updated_at, @recorded_at
    )
    ON CONFLICT (card_id, variant, observed_date) DO UPDATE SET
      usd = excluded.usd,
      eur = excluded.eur,
      source = excluded.source,
      source_updated_at = excluded.source_updated_at,
      recorded_at = excluded.recorded_at
  `);

  const upsertRun = db.prepare(`
    INSERT INTO snapshot_runs (observed_date, recorded_at, point_count)
    VALUES (@observed_date, @recorded_at, @point_count)
    ON CONFLICT (observed_date) DO UPDATE SET
      recorded_at = excluded.recorded_at,
      point_count = excluded.point_count
  `);

  let inserted = 0;
  let updated = 0;
  let pointCount = 0;
  let prune: PriceHistoryPruneResult | undefined;

  const writeSnapshot = db.transaction(() => {
    for (const card of input.allCards) {
      const entry = input.snapshot.entries[card.id];

      for (const variant of catalogueVariants(card)) {
        const { usd, eur } = getPriceForCard(card, variant, input.snapshot);
        if (!hasNativePrice(usd, eur)) continue;

        const key = `${card.id}\0${variant}`;
        if (existingKeys.has(key)) updated++;
        else inserted++;

        upsert.run({
          card_id: card.id,
          variant,
          observed_date: input.observedDate,
          usd,
          eur,
          source: entry?.source ?? null,
          source_updated_at: entry?.updatedAt ?? null,
          recorded_at: recordedAt,
        });
        pointCount++;
      }
    }

    upsertRun.run({
      observed_date: input.observedDate,
      recorded_at: recordedAt,
      point_count: pointCount,
    });
  });

  try {
    writeSnapshot();
    prune = prunePriceHistoryOnDb(db, {
      referenceDate: input.observedDate,
      retentionDays: input.retentionDays,
    });
  } finally {
    db.close();
  }

  return {
    dbPath,
    observedDate: input.observedDate,
    recordedAt,
    pointCount,
    inserted,
    updated,
    prune,
  };
}

/** Read-only helper for tests and verification. */
export function readPriceHistoryRow(
  dbPath: string,
  cardId: string,
  variant: string,
  observedDate: string
): {
  usd: number | null;
  eur: number | null;
  source: string | null;
  source_updated_at: string | null;
} | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .prepare(
        `SELECT usd, eur, source, source_updated_at
         FROM price_history
         WHERE card_id = ? AND variant = ? AND observed_date = ?`
      )
      .get(cardId, variant, observedDate) as
      | {
          usd: number | null;
          eur: number | null;
          source: string | null;
          source_updated_at: string | null;
        }
      | undefined;
    return row ?? null;
  } finally {
    db.close();
  }
}

/** Count history rows for a given observed date (tests / verification). */
export function countPriceHistoryForDate(
  dbPath: string,
  observedDate: string
): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    const row = db
      .prepare(`SELECT COUNT(*) AS c FROM price_history WHERE observed_date = ?`)
      .get(observedDate) as { c: number };
    return row.c;
  } finally {
    db.close();
  }
}

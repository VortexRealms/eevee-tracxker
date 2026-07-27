/**
 * Local SQLite daily price history snapshots.
 * Written after successful fetch:prices Sheet sync; read-only on Vercel in a later phase.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getPriceForCard } from "../lib/cards";
import type { PokemonCard, PricesSnapshot } from "../types";

export const DEFAULT_PRICE_HISTORY_DB_PATH = path.join(
  process.cwd(),
  "data",
  "price-history.sqlite"
);

export interface PriceHistorySnapshotResult {
  dbPath: string;
  observedDate: string;
  recordedAt: string;
  pointCount: number;
  inserted: number;
  updated: number;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS price_history (
  card_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  usd REAL,
  eur REAL,
  source TEXT,
  source_updated_at TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (card_id, variant, observed_date)
);

CREATE INDEX IF NOT EXISTS idx_price_history_card_variant_date
  ON price_history (card_id, variant, observed_date);

CREATE TABLE IF NOT EXISTS snapshot_runs (
  observed_date TEXT PRIMARY KEY,
  recorded_at TEXT NOT NULL,
  point_count INTEGER NOT NULL
);
`;

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

/**
 * Snapshot resolved USD/EUR prices for every catalogue variant into SQLite.
 * Same-day reruns upsert rows (idempotent). Missing currencies stay NULL.
 */
export function writePriceHistorySnapshot(input: {
  allCards: PokemonCard[];
  snapshot: PricesSnapshot;
  observedDate: string;
  dbPath?: string;
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

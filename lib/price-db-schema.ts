/** Shared SQLite schema for git-tracked price database (history + current prices). */

import { PRICE_DB_USER_VERSION } from "./variant-price-contract";

export { PRICE_DB_USER_VERSION };

export const CURRENT_PRICES_V1_SQL = `
CREATE TABLE IF NOT EXISTS current_prices (
  card_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  usd REAL,
  eur REAL,
  updated_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pokewallet', 'ebay', 'manual')),
  price_kind TEXT NOT NULL CHECK (price_kind IN ('market', 'active_listing_median', 'manual')),
  sample_count INTEGER,
  metadata_json TEXT,
  orphan INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_current_prices_source ON current_prices (source);
CREATE INDEX IF NOT EXISTS idx_current_prices_card ON current_prices (card_id);
`;

export const PRICE_DB_SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS price_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rates_updated_at TEXT NOT NULL,
  usd_rates_json TEXT NOT NULL DEFAULT '{}'
);

${CURRENT_PRICES_V1_SQL}
`;

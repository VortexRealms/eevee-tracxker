/**
 * Lossless migration from card-level current_prices to variant-level rows.
 * Run with: npm run migrate:current-prices [-- --dry-run] [-- --db path]
 */

import fs from "node:fs";
import Database from "better-sqlite3";
import cardsData from "../data/cards.json";
import { getPriceForCard } from "../lib/cards";
import {
  CURRENT_PRICES_V1_SQL,
  getPricesSnapshotFromDb,
  openPriceDb,
  PRICE_DB_USER_VERSION,
} from "../lib/price-db";
import { PRICE_DB_PATH } from "../lib/price-db-path";
import type { PokemonCard, PriceEntry } from "../types";
import {
  defaultPriceKindForSource,
  expandEntryToVariantRows,
  groupVariantRowsToEntries,
  type VariantPriceRow,
} from "../lib/variant-price-contract";

const cards = cardsData as PokemonCard[];
const catalogueVariantsByCard: Record<string, string[]> = {};
for (const card of cards) {
  catalogueVariantsByCard[card.id] = card.variants?.length ? card.variants : ["normal"];
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let dbPath = PRICE_DB_PATH;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    if (args[i] === "--db" && args[i + 1]) dbPath = args[++i];
  }
  return { dryRun, dbPath };
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
  return {
    usd: row.usd,
    eur: row.eur,
    updatedAt: row.updated_at,
    source: row.source === "manual" ? "manual" : "pokewallet",
    ...(variants ? { variants } : {}),
  };
}

function isLegacySchema(db: Database.Database): boolean {
  const cols = db.prepare(`PRAGMA table_info(current_prices)`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === "variants_json");
}

function verifyParity(
  before: Record<string, PriceEntry>,
  afterRows: VariantPriceRow[]
): string[] {
  const after = groupVariantRowsToEntries(afterRows);
  const errors: string[] = [];

  for (const card of cards) {
    for (const variant of catalogueVariantsByCard[card.id] ?? ["normal"]) {
      const oldUsd = getPriceForCard(card, variant, { meta: { ratesUpdatedAt: "" }, entries: before }).usd;
      const newUsd = getPriceForCard(card, variant, { meta: { ratesUpdatedAt: "" }, entries: after }).usd;
      const oldEur = getPriceForCard(card, variant, { meta: { ratesUpdatedAt: "" }, entries: before }).eur;
      const newEur = getPriceForCard(card, variant, { meta: { ratesUpdatedAt: "" }, entries: after }).eur;
      if (oldUsd !== newUsd || oldEur !== newEur) {
        errors.push(
          `${card.id}.${variant}: before usd=${oldUsd} eur=${oldEur}, after usd=${newUsd} eur=${newEur}`
        );
      }
    }
  }

  return errors;
}

function main() {
  const { dryRun, dbPath } = parseArgs();
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    process.exit(1);
  }

  const beforeSnapshot = getPricesSnapshotFromDb(dbPath);
  const db = openPriceDb(dbPath);
  try {
    if (!isLegacySchema(db)) {
      const version = db.pragma("user_version", { simple: true }) as number;
      console.log(`Already migrated (user_version=${version}). Nothing to do.`);
      return;
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

    const variantRows = legacyRows.flatMap((row) => {
      const entry = legacyRowToEntry(row);
      const catalogueVariants = catalogueVariantsByCard[row.card_id] ?? ["normal"];
      const card = cards.find((c) => c.id === row.card_id);
      const cardSource = entry.source ?? "pokewallet";
      const expanded = expandEntryToVariantRows(row.card_id, entry, catalogueVariants, {
        includeOrphans: true,
        card,
      });
      if (expanded.length > 0) return expanded;
      if (entry.usd == null && entry.eur == null) return [];
      return catalogueVariants.map((variant) => ({
        cardId: row.card_id,
        variant,
        usd: entry.usd ?? null,
        eur: entry.eur ?? null,
        updatedAt: entry.updatedAt,
        source: cardSource,
        priceKind: defaultPriceKindForSource(cardSource),
        orphan: false,
      }));
    });

    const parityErrors = verifyParity(beforeSnapshot.entries, variantRows);
    if (parityErrors.length > 0) {
      console.error("Migration parity check failed:");
      for (const err of parityErrors.slice(0, 20)) {
        console.error(`  ${err}`);
      }
      if (parityErrors.length > 20) {
        console.error(`  ... and ${parityErrors.length - 20} more`);
      }
      process.exit(1);
    }

    console.log(`Prepared ${variantRows.length} variant row(s) from ${legacyRows.length} legacy card row(s).`);

    if (dryRun) {
      console.log("Dry run complete — no changes written.");
      return;
    }

    const backupPath = `${dbPath}.bak-variant-migration-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(dbPath, backupPath);
    console.log(`Backup written: ${backupPath}`);

    const migrate = db.transaction(() => {
      db.exec(`ALTER TABLE current_prices RENAME TO current_prices_legacy`);
      db.exec(CURRENT_PRICES_V1_SQL);

      const insert = db.prepare(`
        INSERT INTO current_prices (
          card_id, variant, usd, eur, updated_at, source, price_kind,
          sample_count, metadata_json, orphan
        ) VALUES (
          @card_id, @variant, @usd, @eur, @updated_at, @source, @price_kind,
          @sample_count, @metadata_json, @orphan
        )
      `);

      for (const row of variantRows) {
        insert.run({
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
        });
      }

      db.pragma(`user_version = ${PRICE_DB_USER_VERSION}`);
    });

    migrate();
    console.log(`Migration complete. user_version=${PRICE_DB_USER_VERSION}`);
    console.log(`Legacy table preserved as current_prices_legacy`);
  } finally {
    db.close();
  }
}

main();

/**
 * One-off: remove false "normal" variant rows for holo-only promos and merge CM EUR onto holo.
 *
 * Run with: npx tsx scripts/migrate-holo-only-promo-variants.ts
 */

import Database from "better-sqlite3";
import cardsData from "../data/cards.json";
import { isHoloOnlyPromoCard } from "../lib/cards";
import type { PokemonCard } from "../types";
import { PRICE_DB_PATH } from "../lib/price-db-path";

const cards = cardsData as PokemonCard[];
const holoOnlyPromoIds = cards.filter(isHoloOnlyPromoCard).map((c) => c.id);

if (holoOnlyPromoIds.length === 0) {
  console.log("No holo-only promo cards found.");
  process.exit(0);
}

const db = new Database(PRICE_DB_PATH);
try {
  const migrate = db.transaction(() => {
    for (const cardId of holoOnlyPromoIds) {
      const holo = db
        .prepare(
          `SELECT usd, eur, updated_at, source, price_kind, sample_count, metadata_json
           FROM current_prices WHERE card_id = ? AND variant = 'holo'`
        )
        .get(cardId) as
        | {
            usd: number | null;
            eur: number | null;
            updated_at: string;
            source: string;
            price_kind: string;
            sample_count: number | null;
            metadata_json: string | null;
          }
        | undefined;

      const normal = db
        .prepare(
          `SELECT usd, eur, updated_at, source, price_kind
           FROM current_prices WHERE card_id = ? AND variant = 'normal'`
        )
        .get(cardId) as
        | {
            usd: number | null;
            eur: number | null;
            updated_at: string;
            source: string;
            price_kind: string;
          }
        | undefined;

      if (holo || normal) {
        const usd = holo?.usd ?? normal?.usd ?? null;
        const eur = normal?.eur ?? holo?.eur ?? null;
        db.prepare(
          `INSERT INTO current_prices (
             card_id, variant, usd, eur, updated_at, source, price_kind,
             sample_count, metadata_json, orphan
           ) VALUES (?, 'holo', ?, ?, ?, ?, ?, ?, ?, 0)
           ON CONFLICT (card_id, variant) DO UPDATE SET
             usd = excluded.usd,
             eur = excluded.eur,
             updated_at = excluded.updated_at,
             source = excluded.source,
             price_kind = excluded.price_kind,
             orphan = 0`
        ).run(
          cardId,
          usd,
          eur,
          holo?.updated_at ?? normal?.updated_at ?? "",
          holo?.source ?? normal?.source ?? "pokewallet",
          holo?.price_kind ?? normal?.price_kind ?? "market",
          holo?.sample_count ?? null,
          holo?.metadata_json ?? null
        );
      }

      db.prepare(`DELETE FROM current_prices WHERE card_id = ? AND variant = 'normal'`).run(
        cardId
      );

      const historyDates = db
        .prepare(
          `SELECT DISTINCT observed_date FROM price_history
           WHERE card_id = ? AND variant IN ('normal', 'holo')`
        )
        .all(cardId) as Array<{ observed_date: string }>;

      for (const { observed_date } of historyDates) {
        const holoHist = db
          .prepare(
            `SELECT usd, eur, source, source_updated_at, recorded_at
             FROM price_history
             WHERE card_id = ? AND variant = 'holo' AND observed_date = ?`
          )
          .get(cardId, observed_date) as
          | {
              usd: number | null;
              eur: number | null;
              source: string | null;
              source_updated_at: string | null;
              recorded_at: string;
            }
          | undefined;

        const normalHist = db
          .prepare(
            `SELECT usd, eur, source, source_updated_at, recorded_at
             FROM price_history
             WHERE card_id = ? AND variant = 'normal' AND observed_date = ?`
          )
          .get(cardId, observed_date) as
          | {
              usd: number | null;
              eur: number | null;
              source: string | null;
              source_updated_at: string | null;
              recorded_at: string;
            }
          | undefined;

        if (!holoHist && !normalHist) continue;

        const usd = holoHist?.usd ?? normalHist?.usd ?? null;
        const eur = normalHist?.eur ?? holoHist?.eur ?? null;
        const source = holoHist?.source ?? normalHist?.source ?? null;
        const sourceUpdatedAt =
          holoHist?.source_updated_at ?? normalHist?.source_updated_at ?? null;
        const recordedAt =
          holoHist?.recorded_at ?? normalHist?.recorded_at ?? observed_date;

        db.prepare(
          `INSERT INTO price_history (
             card_id, variant, observed_date, usd, eur, source, source_updated_at, recorded_at
           ) VALUES (?, 'holo', ?, ?, ?, ?, ?, ?)
           ON CONFLICT (card_id, variant, observed_date) DO UPDATE SET
             usd = excluded.usd,
             eur = excluded.eur,
             source = excluded.source,
             source_updated_at = excluded.source_updated_at,
             recorded_at = excluded.recorded_at`
        ).run(
          cardId,
          observed_date,
          usd,
          eur,
          source,
          sourceUpdatedAt,
          recordedAt
        );
      }

      db.prepare(`DELETE FROM price_history WHERE card_id = ? AND variant = 'normal'`).run(
        cardId
      );
    }
  });

  migrate();
  console.log(
    `Migrated ${holoOnlyPromoIds.length} holo-only promo card(s): ${holoOnlyPromoIds.join(", ")}`
  );
} finally {
  db.close();
}

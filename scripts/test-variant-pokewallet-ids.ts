/**
 * Tests for variant-specific Pokewallet ID cache + multi-request price assembly.
 *
 * Run with: npm run test:variant-pokewallet-ids
 */

import Database from "better-sqlite3";
import type { PokewalletCardResult } from "./pokewallet-client";
import { migrateSwsh195VariantPrices } from "./migrate-swsh195-variant-prices";
import { migrateSwsh197VariantPrices } from "./migrate-swsh197-variant-prices";
import {
  hasCachedPokewalletId,
  listVariantFetchTargets,
  mergeCatalogueVariantPriceEntries,
  pokewalletResultToCatalogueVariantPrice,
  pokewalletResultToPriceEntry,
  preserveCuratedVariantIds,
  type PokewalletIdCacheEntry,
} from "./pokewallet-price-utils";

const TODAY = "2026-08-13";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function mockResult(usd: number, eur: number | null = null): PokewalletCardResult {
  return {
    id: "pk_test",
    card_info: { name: "Test", card_number: "1", set_name: "Test Set" },
    tcgplayer: {
      prices: [{ sub_type_name: "Holofoil", market_price: usd }],
    },
    cardmarket:
      eur == null
        ? undefined
        : {
            prices: [{ variant_type: "holo", avg: eur }],
          },
  };
}

function testLegacySingleIdCache() {
  const entry: PokewalletIdCacheEntry = {
    pokewalletId: "pk_single",
    setCode: "SWSD",
    resolvedAt: TODAY,
  };

  assert(hasCachedPokewalletId(entry), "single ID counts as cached");
  const targets = listVariantFetchTargets(entry);
  assert(targets.length === 1, "single ID -> one fetch target");
  assert(targets[0].catalogueVariant === "__default__", "default path");

  const price = pokewalletResultToPriceEntry(mockResult(2.47, 3.1), TODAY);
  assert(price?.variants?.holo?.usd === 2.47, "legacy maps Holofoil -> holo");
}

function testThreeIdRequestAssembly() {
  const entry: PokewalletIdCacheEntry = {
    pokewalletId: "pk_holo",
    setCode: "SWSD",
    resolvedAt: TODAY,
    variants: {
      holo: {
        pokewalletId: "pk_holo",
        setCode: "SWSD",
        resolvedAt: TODAY,
      },
      playPokemon: {
        pokewalletId: "pk_pp",
        setCode: "22880",
        resolvedAt: TODAY,
      },
      jumbo: {
        pokewalletId: "pk_jumbo",
        setCode: "PR",
        resolvedAt: TODAY,
      },
    },
  };

  const targets = listVariantFetchTargets(entry);
  assert(targets.length === 3, "three variant fetch targets");
  assert(
    targets.map((t) => t.catalogueVariant).sort().join(",") ===
      "holo,jumbo,playPokemon",
    "catalogue variant keys"
  );

  const merged = mergeCatalogueVariantPriceEntries(
    [
      pokewalletResultToCatalogueVariantPrice(mockResult(2.47, 3.1), "holo", TODAY),
      pokewalletResultToCatalogueVariantPrice(mockResult(182.39), "playPokemon", TODAY),
      pokewalletResultToCatalogueVariantPrice(mockResult(4.67), "jumbo", TODAY),
    ],
    TODAY
  );

  assert(merged?.variants?.holo?.usd === 2.47, "holo USD");
  assert(merged?.variants?.holo?.eur === 3.1, "holo EUR");
  assert(merged?.variants?.playPokemon?.usd === 182.39, "playPokemon USD");
  assert(merged?.variants?.jumbo?.usd === 4.67, "jumbo USD");
  assert(Object.keys(merged?.variants ?? {}).length === 3, "three variant keys");
}

function testExplicitResponseRemapping() {
  const prizePackResponse = mockResult(182.39);
  const mapped = pokewalletResultToCatalogueVariantPrice(
    prizePackResponse,
    "playPokemon",
    TODAY
  );

  assert(mapped?.variants?.playPokemon?.usd === 182.39, "target key is playPokemon");
  assert(mapped?.variants?.holo == null, "does not trust internal Holofoil slot");
}

function testPreserveCuratedVariantIds() {
  const existing: PokewalletIdCacheEntry = {
    pokewalletId: "pk_old",
    setCode: "22880",
    resolvedAt: "2026-07-20",
    variants: {
      holo: {
        pokewalletId: "pk_holo",
        setCode: "SWSD",
        resolvedAt: "2026-07-20",
      },
    },
  };

  const incoming: PokewalletIdCacheEntry = {
    pokewalletId: "pk_new_search",
    setCode: "22880",
    resolvedAt: TODAY,
    matchScore: 150,
  };

  const merged = preserveCuratedVariantIds(incoming, existing);
  assert(merged.pokewalletId === "pk_new_search", "root ID updated");
  assert(merged.variants?.holo?.pokewalletId === "pk_holo", "curated variants kept");
}

function testMigrationIdempotency() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE price_history (
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
    CREATE TABLE current_prices (
      card_id TEXT PRIMARY KEY,
      usd REAL,
      eur REAL,
      updated_at TEXT NOT NULL,
      variants_json TEXT,
      source TEXT NOT NULL
    );
  `);

  const insertHistory = db.prepare(`
    INSERT INTO price_history (card_id, variant, observed_date, usd, eur, recorded_at, source)
    VALUES (?, ?, ?, ?, ?, ?, 'pokewallet')
  `);

  insertHistory.run("swshp-SWSH195", "normal", "2026-08-10", 180, null, TODAY);
  insertHistory.run("swshp-SWSH195", "holo", "2026-08-13", 182.39, null, TODAY);
  insertHistory.run("swshp-SWSH195", "playPokemon", "2026-08-01", 175, null, TODAY);

  db.prepare(`
    INSERT INTO current_prices (card_id, usd, eur, updated_at, variants_json, source)
    VALUES (?, ?, ?, ?, ?, 'pokewallet')
  `).run(
    "swshp-SWSH195",
    182.39,
    null,
    TODAY,
    JSON.stringify({ holo: { usd: 182.39, eur: null } })
  );

  const first = migrateSwsh195VariantPrices(db);
  assert(first.historyRenamed === 2, "two history rows renamed first pass");
  assert(first.historyConflictsDeleted === 0, "no conflicts on first pass");
  assert(first.currentUpdated, "current row updated");

  const playPokemonCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM price_history WHERE card_id = 'swshp-SWSH195' AND variant = 'playPokemon'`
      )
      .get() as { c: number }
  ).c;
  assert(playPokemonCount === 3, "all history under playPokemon");

  const holoCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM price_history WHERE card_id = 'swshp-SWSH195' AND variant = 'holo'`
      )
      .get() as { c: number }
  ).c;
  assert(holoCount === 0, "holo history removed");

  const current = JSON.parse(
    (
      db
        .prepare(`SELECT variants_json FROM current_prices WHERE card_id = 'swshp-SWSH195'`)
        .get() as { variants_json: string }
    ).variants_json
  ) as Record<string, unknown>;

  assert(current.playPokemon != null, "playPokemon current from holo");
  assert(current.holo == null, "incorrect holo current removed");

  const second = migrateSwsh195VariantPrices(db);
  assert(second.historyRenamed === 0, "second pass renames nothing");
  assert(second.historyConflictsDeleted === 0, "second pass deletes nothing");

  db.close();
}

function testSwsh197ThreeIdAssembly() {
  const entry: PokewalletIdCacheEntry = {
    pokewalletId: "pk_8570e73d9cf11638354094e51b5f0327a1018bef8e326e6eb698f30f94475d0ecf390a775152bd5e9a54d79bb685b7",
    setCode: "SWSD",
    resolvedAt: TODAY,
    variants: {
      holo: {
        pokewalletId:
          "pk_8570e73d9cf11638354094e51b5f0327a1018bef8e326e6eb698f30f94475d0ecf390a775152bd5e9a54d79bb685b7",
        setCode: "SWSD",
        resolvedAt: TODAY,
      },
      playPokemon: {
        pokewalletId:
          "pk_49f03975953cf61b8a6d17344305ad04d8a65441a990af3c9657ad73c70f209f2a512471b602018bbeead955d44442bf",
        setCode: "22880",
        resolvedAt: TODAY,
      },
      jumbo: {
        pokewalletId:
          "pk_cb0682ea91f9587dafbfe0c74a466f39fcdd38bc666d94b98eeb09ac402b969acad42b4ec39fb161d2429c2aa44b71",
        setCode: "PR",
        resolvedAt: TODAY,
      },
    },
  };

  assert(listVariantFetchTargets(entry).length === 3, "SWSH197 has three fetch targets");

  const merged = mergeCatalogueVariantPriceEntries(
    [
      pokewalletResultToCatalogueVariantPrice(mockResult(3.89, 3.94), "holo", TODAY),
      pokewalletResultToCatalogueVariantPrice(mockResult(324.99), "playPokemon", TODAY),
      pokewalletResultToCatalogueVariantPrice(mockResult(4.88), "jumbo", TODAY),
    ],
    TODAY
  );

  assert(merged?.variants?.holo?.usd === 3.89, "SWSH197 holo USD");
  assert(merged?.variants?.playPokemon?.usd === 324.99, "SWSH197 playPokemon USD");
  assert(merged?.variants?.jumbo?.usd === 4.88, "SWSH197 jumbo USD");
}

function testSwsh197MigrationIdempotency() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE price_history (
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
    CREATE TABLE current_prices (
      card_id TEXT PRIMARY KEY,
      usd REAL,
      eur REAL,
      updated_at TEXT NOT NULL,
      variants_json TEXT,
      source TEXT NOT NULL
    );
  `);

  const insertHistory = db.prepare(`
    INSERT INTO price_history (card_id, variant, observed_date, usd, eur, recorded_at, source)
    VALUES (?, ?, ?, ?, ?, ?, 'pokewallet')
  `);

  insertHistory.run("swshp-SWSH197", "normal", "2026-08-10", 278, null, TODAY);
  insertHistory.run("swshp-SWSH197", "holo", "2026-08-13", 324.99, null, TODAY);

  db.prepare(`
    INSERT INTO current_prices (card_id, usd, eur, updated_at, variants_json, source)
    VALUES (?, ?, ?, ?, ?, 'pokewallet')
  `).run(
    "swshp-SWSH197",
    324.99,
    null,
    TODAY,
    JSON.stringify({ holo: { usd: 324.99, eur: null } })
  );

  const first = migrateSwsh197VariantPrices(db);
  assert(first.historyRenamed === 2, "SWSH197 two history rows renamed");
  assert(first.currentUpdated, "SWSH197 current row updated");

  const playPokemonCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM price_history WHERE card_id = 'swshp-SWSH197' AND variant = 'playPokemon'`
      )
      .get() as { c: number }
  ).c;
  assert(playPokemonCount === 2, "SWSH197 history under playPokemon");

  const current = JSON.parse(
    (
      db
        .prepare(`SELECT variants_json FROM current_prices WHERE card_id = 'swshp-SWSH197'`)
        .get() as { variants_json: string }
    ).variants_json
  ) as Record<string, { usd?: number }>;

  assert(current.playPokemon?.usd === 324.99, "SWSH197 prize pack current preserved");
  assert(current.holo == null, "SWSH197 incorrect holo current removed");

  const second = migrateSwsh197VariantPrices(db);
  assert(second.historyRenamed === 0, "SWSH197 second pass renames nothing");

  db.close();
}

function main() {
  testLegacySingleIdCache();
  testThreeIdRequestAssembly();
  testExplicitResponseRemapping();
  testPreserveCuratedVariantIds();
  testMigrationIdempotency();
  testSwsh197ThreeIdAssembly();
  testSwsh197MigrationIdempotency();
  console.log("All variant-specific Pokewallet ID tests passed.");
}

main();

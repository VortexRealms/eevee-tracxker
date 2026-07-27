/**
 * SQLite price history snapshot checks.
 * Run with: npm run test:price-history
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { getPriceForCard } from "../lib/cards";
import type { PokemonCard, PricesSnapshot } from "../types";
import {
  countPriceHistoryForDate,
  readPriceHistoryRow,
  writePriceHistorySnapshot,
} from "./price-history-sqlite";

function tempDbPath(): string {
  return path.join(
    os.tmpdir(),
    `price-history-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`
  );
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
    throw new Error(message);
  }
}

function sidecarPaths(dbPath: string): string[] {
  return [`${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`];
}

function assertNoSidecars(dbPath: string): void {
  for (const sidecar of sidecarPaths(dbPath)) {
    assert(!fs.existsSync(sidecar), `sidecar should not exist: ${sidecar}`);
  }
}

const holoOnlyCard: PokemonCard = {
  id: "alias-holo",
  name: "Alias Holo",
  number: "1",
  rarity: "Rare",
  supertype: "Pokémon",
  set: { id: "test", name: "Test", series: "Test", releaseDate: "2020/01/01" },
  images: { small: "", large: "" },
  variants: ["holo"],
};

const multiVariantCard: PokemonCard = {
  id: "multi-1",
  name: "Multi",
  number: "2",
  rarity: "Rare",
  supertype: "Pokémon",
  set: { id: "test", name: "Test", series: "Test", releaseDate: "2020/01/01" },
  images: { small: "", large: "" },
  variants: ["holo", "reverse", "pokeball"],
};

const noPriceCard: PokemonCard = {
  id: "empty-1",
  name: "Empty",
  number: "3",
  rarity: "Common",
  supertype: "Pokémon",
  set: { id: "test", name: "Test", series: "Test", releaseDate: "2020/01/01" },
  images: { small: "", large: "" },
  variants: ["normal"],
};

const manualWholeRowCard: PokemonCard = {
  id: "manual-row",
  name: "Manual Row",
  number: "4",
  rarity: "Rare",
  supertype: "Pokémon",
  set: { id: "test", name: "Test", series: "Test", releaseDate: "2020/01/01" },
  images: { small: "", large: "" },
  variants: ["holo"],
};

const hybridCard: PokemonCard = {
  id: "hybrid-1",
  name: "Hybrid",
  number: "5",
  rarity: "Rare",
  supertype: "Pokémon",
  set: { id: "test", name: "Test", series: "Test", releaseDate: "2020/01/01" },
  images: { small: "", large: "" },
  variants: ["holo", "pokeball"],
};

const allCards = [
  holoOnlyCard,
  multiVariantCard,
  noPriceCard,
  manualWholeRowCard,
  hybridCard,
];

const day1 = "2026-07-25";
const day2 = "2026-07-26";

const baseSnapshot: PricesSnapshot = {
  meta: { ratesUpdatedAt: "2026-07-25T12:00:00.000Z" },
  entries: {
    "alias-holo": {
      usd: 2.5,
      eur: 2.2,
      updatedAt: day1,
      source: "pokewallet",
      variants: { normal: { usd: 2.5, eur: 2.2 } },
    },
    "multi-1": {
      usd: 1.0,
      eur: 0.9,
      updatedAt: day1,
      source: "pokewallet",
      variants: {
        holo: { usd: 1.0, eur: 0.9 },
        reverse: { usd: 1.2, eur: null },
        pokeball: { usd: 12.0, eur: 10.5 },
      },
    },
    "manual-row": {
      usd: 5.0,
      eur: 4.5,
      updatedAt: day1,
      source: "manual",
      variants: { holo: { usd: 5.0, eur: 4.5 } },
    },
    "hybrid-1": {
      usd: 0.8,
      eur: 0.7,
      updatedAt: day1,
      source: "pokewallet",
      variants: {
        holo: { usd: 0.8, eur: 0.7 },
        pokeball: { usd: 9.0, eur: null },
      },
    },
  },
};

let failed = 0;

function check(label: string, condition: boolean): void {
  if (!condition) {
    failed++;
    console.error(`FAIL ${label}`);
  }
}

try {
  const dbPath = tempDbPath();

  // Initial schema creation and insert
  const first = writePriceHistorySnapshot({
    allCards,
    snapshot: baseSnapshot,
    observedDate: day1,
    dbPath,
  });
  check("creates database file", fs.existsSync(dbPath));
  check("initial insert count > 0", first.inserted > 0 && first.updated === 0);
  check("initial point count matches rows", first.pointCount === countPriceHistoryForDate(dbPath, day1));

  const aliasResolved = getPriceForCard(holoOnlyCard, "holo", baseSnapshot);
  const aliasRow = readPriceHistoryRow(dbPath, "alias-holo", "holo", day1);
  check(
    "alias resolution matches app",
    aliasRow?.usd === aliasResolved.usd && aliasRow?.eur === aliasResolved.eur
  );

  const nullEurRow = readPriceHistoryRow(dbPath, "multi-1", "reverse", day1);
  check("null EUR stays null", nullEurRow?.usd === 1.2 && nullEurRow?.eur === null);

  check(
    "no-price card skipped",
    readPriceHistoryRow(dbPath, "empty-1", "normal", day1) === null
  );

  const manualRow = readPriceHistoryRow(dbPath, "manual-row", "holo", day1);
  check(
    "whole-row manual included",
    manualRow?.usd === 5.0 && manualRow?.source === "manual"
  );

  const hybridRow = readPriceHistoryRow(dbPath, "hybrid-1", "pokeball", day1);
  check(
    "hybrid manual variant included",
    hybridRow?.usd === 9.0 && hybridRow?.eur === null
  );

  // Same-date rerun is idempotent (no duplicate rows)
  const second = writePriceHistorySnapshot({
    allCards,
    snapshot: baseSnapshot,
    observedDate: day1,
    dbPath,
  });
  check("same-date rerun has zero inserts", second.inserted === 0);
  check("same-date rerun updates existing rows", second.updated === second.pointCount);
  check(
    "same-date row count unchanged",
    countPriceHistoryForDate(dbPath, day1) === first.pointCount
  );

  // Same-date manual price change updates the row
  const manualChangedSnapshot: PricesSnapshot = {
    ...baseSnapshot,
    entries: {
      ...baseSnapshot.entries,
      "manual-row": {
        usd: 6.25,
        eur: 5.5,
        updatedAt: day1,
        source: "manual",
        variants: { holo: { usd: 6.25, eur: 5.5 } },
      },
    },
  };
  writePriceHistorySnapshot({
    allCards,
    snapshot: manualChangedSnapshot,
    observedDate: day1,
    dbPath,
  });
  const updatedManual = readPriceHistoryRow(dbPath, "manual-row", "holo", day1);
  check(
    "same-date manual edit updates row",
    updatedManual?.usd === 6.25 && updatedManual?.eur === 5.5
  );
  check(
    "same-date still single row per variant",
    countPriceHistoryForDate(dbPath, day1) === first.pointCount
  );

  // Next date appends history
  const nextDaySnapshot: PricesSnapshot = {
    ...manualChangedSnapshot,
    entries: {
      ...manualChangedSnapshot.entries,
      "multi-1": {
        usd: 1.1,
        eur: 1.0,
        updatedAt: day2,
        source: "pokewallet",
        variants: {
          holo: { usd: 1.1, eur: 1.0 },
          reverse: { usd: 1.2, eur: null },
          pokeball: { usd: 12.0, eur: 10.5 },
        },
      },
    },
  };
  const day2Result = writePriceHistorySnapshot({
    allCards,
    snapshot: nextDaySnapshot,
    observedDate: day2,
    dbPath,
  });
  check("next date inserts new rows", day2Result.inserted === day2Result.pointCount);
  check(
    "history appended for new date",
    countPriceHistoryForDate(dbPath, day2) === day2Result.pointCount
  );
  check(
    "prior date preserved",
    countPriceHistoryForDate(dbPath, day1) === first.pointCount
  );

  const day1Holo = readPriceHistoryRow(dbPath, "multi-1", "holo", day1);
  const day2Holo = readPriceHistoryRow(dbPath, "multi-1", "holo", day2);
  check("day1 holo unchanged after day2 snapshot", day1Holo?.usd === 1.0);
  check("day2 holo reflects new snapshot", day2Holo?.usd === 1.1);

  // snapshot_runs table populated
  const db = new Database(dbPath, { readonly: true });
  const runRow = db
    .prepare(`SELECT point_count FROM snapshot_runs WHERE observed_date = ?`)
    .get(day2) as { point_count: number } | undefined;
  db.close();
  check("snapshot_runs records point count", runRow?.point_count === day2Result.pointCount);

  assertNoSidecars(dbPath);

  fs.unlinkSync(dbPath);
} catch (err) {
  if (!process.exitCode) process.exitCode = 1;
  console.error(err);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log("All price history SQLite checks passed.");

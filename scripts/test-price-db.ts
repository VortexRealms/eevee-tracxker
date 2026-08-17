import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PriceEntry } from "../types";
import {
  getPricesSnapshotFromDb,
  importAllPricesToDb,
  openPriceDb,
  syncPricesToDb,
  verifyPriceDbIntegrity,
} from "../lib/price-db";
import { writePriceHistorySnapshot } from "./price-history-sqlite";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "price-db-test-"));
const dbPath = path.join(tmpDir, "prices.sqlite");

function cleanup() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch {
      /* ignore */
    }
  }
  try {
    fs.rmdirSync(tmpDir);
  } catch {
    /* ignore */
  }
}

try {
  openPriceDb(dbPath);

  const manualEntry: PriceEntry = {
    usd: 10,
    eur: 9,
    updatedAt: "2026-08-12",
    source: "manual",
    variants: {
      normal: {
        usd: 10,
        eur: 9,
        updatedAt: "2026-08-12",
        source: "manual",
        priceKind: "manual",
      },
    },
  };
  const pokewalletEntry: PriceEntry = {
    usd: 12,
    eur: 11,
    updatedAt: "2026-08-12",
    source: "pokewallet",
    variants: {
      holo: {
        usd: 12,
        eur: 11,
        updatedAt: "2026-08-12",
        source: "pokewallet",
        priceKind: "market",
      },
    },
  };

  const catalogueVariantsByCard = {
    "base1-1": ["normal"],
    "base2-3": ["holo"],
  };

  importAllPricesToDb(
    { "base1-1": manualEntry, "base2-3": pokewalletEntry },
    { "base1-1": "manual", "base2-3": "pokewallet" },
    { ratesUpdatedAt: "2026-08-12", usdRates: { EUR: 0.9 } },
    catalogueVariantsByCard,
    dbPath
  );

  const snapshot = getPricesSnapshotFromDb(dbPath);
  assert.equal(snapshot.entries["base1-1"].usd, 10);
  assert.equal(snapshot.entries["base2-3"].usd, 12);
  assert.equal(snapshot.meta.usdRates?.EUR, 0.9);
  assert.equal(snapshot.entries["base1-1"].variants?.normal?.source, "manual");

  const sync = syncPricesToDb(
    {
      "base1-1": {
        usd: 99,
        eur: 88,
        updatedAt: "2026-08-13",
        source: "pokewallet",
        variants: {
          normal: {
            usd: 99,
            eur: 88,
            updatedAt: "2026-08-13",
            source: "pokewallet",
            priceKind: "market",
          },
        },
      },
      "base2-3": {
        usd: 20,
        eur: 18,
        updatedAt: "2026-08-13",
        source: "pokewallet",
        variants: {
          holo: {
            usd: 20,
            eur: 18,
            updatedAt: "2026-08-13",
            source: "pokewallet",
            priceKind: "market",
          },
        },
      },
    },
    snapshot.meta,
    catalogueVariantsByCard,
    dbPath
  );
  assert.ok(sync.skipped >= 1);
  assert.equal(getPricesSnapshotFromDb(dbPath).entries["base1-1"].usd, 10);
  assert.equal(getPricesSnapshotFromDb(dbPath).entries["base2-3"].usd, 20);

  const cards = [
    {
      id: "base2-3",
      name: "Flareon",
      number: "3",
      supertype: "Pokémon",
      set: { id: "base2", name: "Jungle", series: "Base", releaseDate: "1999/06/16" },
      images: { small: "https://example.com/s.webp", large: "https://example.com/l.png" },
      variants: ["holo"],
    },
  ];

  const history = writePriceHistorySnapshot({
    allCards: cards,
    snapshot: getPricesSnapshotFromDb(dbPath),
    observedDate: "2026-08-12",
    dbPath,
  });
  assert.ok(history.pointCount >= 1);

  const integrity = verifyPriceDbIntegrity(dbPath, "2026-08-12");
  assert.equal(integrity.ok, true);
  assert.equal(integrity.schemaVersion, 1);

  console.log("test-price-db: ok");
} finally {
  cleanup();
}

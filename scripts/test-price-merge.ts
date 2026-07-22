/**
 * Variant-level merge checks for fetch:prices + manual variants.
 * Run with: npm run test:price-merge
 */

import { mergePriceEntries, variantHasPrice } from "../lib/price-merge";
import type { PriceEntry } from "../types";

type Case = {
  label: string;
  fetched: PriceEntry;
  existing: PriceEntry | undefined;
  expectVariants: Record<string, { usd: number | null; eur: number | null }>;
};

const cases: Case[] = [
  {
    label: "sv8pt5-5 preserves pokeball when fetch has holo+reverse only",
    fetched: {
      usd: 0.32,
      eur: 0.3,
      updatedAt: "2026-07-21",
      variants: {
        holo: { usd: 0.32, eur: 0.3 },
        reverse: { usd: 0.35, eur: null },
      },
    },
    existing: {
      usd: 0.32,
      eur: 0.3,
      updatedAt: "2026-07-20",
      variants: {
        holo: { usd: 0.3, eur: 0.28 },
        reverse: { usd: 0.33, eur: null },
        pokeball: { usd: 12.0, eur: 10.5 },
      },
    },
    expectVariants: {
      holo: { usd: 0.32, eur: 0.3 },
      reverse: { usd: 0.35, eur: null },
      pokeball: { usd: 12.0, eur: 10.5 },
    },
  },
  {
    label: "fetch updates holo USD; pokeball unchanged",
    fetched: {
      usd: 0.4,
      eur: null,
      updatedAt: "2026-07-22",
      variants: {
        holo: { usd: 0.4, eur: null },
      },
    },
    existing: {
      usd: 0.32,
      eur: 0.3,
      updatedAt: "2026-07-21",
      variants: {
        holo: { usd: 0.32, eur: 0.3 },
        pokeball: { usd: 12.0, eur: 10.5 },
      },
    },
    expectVariants: {
      holo: { usd: 0.4, eur: null },
      pokeball: { usd: 12.0, eur: 10.5 },
    },
  },
  {
    label: "empty existing + fetch holo only",
    fetched: {
      usd: 0.32,
      eur: 0.3,
      updatedAt: "2026-07-21",
      variants: { holo: { usd: 0.32, eur: 0.3 } },
    },
    existing: undefined,
    expectVariants: { holo: { usd: 0.32, eur: 0.3 } },
  },
  {
    label: "pokewallet wins when it returns priced pokeball",
    fetched: {
      usd: 15.0,
      eur: null,
      updatedAt: "2026-07-21",
      variants: { pokeball: { usd: 15.0, eur: null } },
    },
    existing: {
      usd: 12.0,
      eur: 10.5,
      updatedAt: "2026-07-20",
      variants: { pokeball: { usd: 12.0, eur: 10.5 } },
    },
    expectVariants: { pokeball: { usd: 15.0, eur: null } },
  },
  {
    label: "preserves masterball manual EUR",
    fetched: {
      usd: 1.0,
      eur: 0.9,
      updatedAt: "2026-07-21",
      variants: { holo: { usd: 1.0, eur: 0.9 } },
    },
    existing: {
      usd: 1.0,
      eur: 0.9,
      updatedAt: "2026-07-20",
      variants: {
        holo: { usd: 0.9, eur: 0.8 },
        masterball: { usd: null, eur: 25.0 },
      },
    },
    expectVariants: {
      holo: { usd: 1.0, eur: 0.9 },
      masterball: { usd: null, eur: 25.0 },
    },
  },
];

function variantEqual(
  a: { usd: number | null; eur: number | null },
  b: { usd: number | null; eur: number | null }
): boolean {
  return a.usd === b.usd && a.eur === b.eur;
}

let failed = 0;

if (!variantHasPrice({ usd: 1, eur: null })) {
  failed++;
  console.error("FAIL variantHasPrice with USD");
}
if (variantHasPrice({ usd: null, eur: null })) {
  failed++;
  console.error("FAIL variantHasPrice empty");
}

for (const c of cases) {
  const merged = mergePriceEntries(c.fetched, c.existing);
  const got = merged.variants ?? {};
  let ok = true;
  for (const [key, expected] of Object.entries(c.expectVariants)) {
    const g = got[key];
    if (!g || !variantEqual(g, expected)) {
      ok = false;
      console.error(
        `FAIL ${c.label} variant ${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(g)}`
      );
    }
  }
  for (const key of Object.keys(got)) {
    if (!(key in c.expectVariants)) {
      ok = false;
      console.error(`FAIL ${c.label} unexpected variant ${key}: ${JSON.stringify(got[key])}`);
    }
  }
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`All ${cases.length + 2} price merge checks passed.`);

/**
 * Variant price contract and provider planner tests.
 */

import assert from "node:assert/strict";
import { buildProviderPlan } from "../lib/price-provider-planner";
import { loadEbayPriceMappings } from "../lib/ebay-price-mappings";
import {
  expandEntryToVariantRows,
  groupVariantRowsToEntries,
  shouldSkipVariantFetch,
} from "../lib/variant-price-contract";
import type { PriceEntry } from "../types";

const entry: PriceEntry = {
  usd: 10,
  eur: 9,
  updatedAt: "2026-08-17",
  source: "pokewallet",
  variants: {
    normal: {
      usd: 10,
      eur: 9,
      updatedAt: "2026-08-17",
      source: "pokewallet",
      priceKind: "market",
    },
    jumbo: {
      usd: 200,
      eur: 180,
      updatedAt: "2026-08-17",
      source: "ebay",
      priceKind: "active_listing_median",
      sampleCount: 4,
    },
  },
};

const rows = expandEntryToVariantRows("ecard2-11", entry, ["normal", "reverse", "jumbo"], {
  includeOrphans: true,
});
assert.equal(rows.length, 2);
assert.equal(rows.find((r) => r.variant === "jumbo")?.source, "ebay");

const regrouped = groupVariantRowsToEntries(rows);
assert.equal(regrouped["ecard2-11"].variants?.jumbo?.source, "ebay");

assert.equal(shouldSkipVariantFetch(entry.variants?.normal, "2026-08-17", false).skip, true);
assert.equal(
  shouldSkipVariantFetch(entry.variants?.jumbo, "2026-08-16", false).skip,
  false
);

const cards = [
  {
    id: "ecard2-11",
    name: "Espeon",
    number: "11",
    supertype: "Pokémon",
    set: { id: "ecard2", name: "Aquapolis", series: "E-Card", releaseDate: "2003/01/01" },
    images: { small: "https://example.com/s.webp", large: "https://example.com/l.png" },
    variants: ["normal", "reverse", "jumbo"],
  },
];

const cache = {
  "ecard2-11": {
    pokewalletId: "pk_test",
    setCode: "ecard2",
    resolvedAt: "2026-08-01",
  },
};

const plan = buildProviderPlan({
  cards,
  cache,
  ebayMappings: loadEbayPriceMappings(),
});
assert.equal(plan.ebayJobs.length, 1);
assert.equal(plan.ebayJobs[0]?.variant, "jumbo");
assert.ok(plan.pokewalletGroups.size >= 1);

const mixedCachePlan = buildProviderPlan({
  cards: [
    {
      ...cards[0],
      id: "smp-SM171",
      variants: ["normal", "holo", "jumbo"],
    },
  ],
  cache: {
    "smp-SM171": {
      pokewalletId: "pk_regular",
      setCode: "SMP",
      resolvedAt: "2026-08-17",
      variants: {
        jumbo: {
          pokewalletId: "pk_jumbo",
          setCode: "",
          resolvedAt: "2026-08-17",
        },
      },
    },
  },
  ebayMappings: {},
});
assert.equal(mixedCachePlan.pokewalletGroups.size, 2);
assert.deepEqual(
  [...mixedCachePlan.pokewalletGroups.values()]
    .flat()
    .map((job) => job.catalogueVariant)
    .sort(),
  ["__default__", "jumbo"]
);

console.log("test-variant-price-contract: ok");

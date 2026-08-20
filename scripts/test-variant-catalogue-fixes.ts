/**
 * Tests for targeted catalogue variant / price storage fixes.
 */

import assert from "node:assert/strict";
import { getPriceForCard, getVariantPriceRecord } from "../lib/cards";
import {
  migrateOwnershipVariant,
  remapPriceEntryVariantsToCatalogue,
  resolvePriceStorageVariant,
} from "../lib/variant-catalogue-fixes";
import { expandEntryToVariantRows } from "../lib/variant-price-contract";
import type { PokemonCard, PriceEntry } from "../types";

const colUmbreon: PokemonCard = {
  id: "col1-22",
  name: "Umbreon",
  number: "22",
  rarity: "Rare Holo",
  supertype: "Pokémon",
  subtypes: ["Stage 1"],
  types: ["Darkness"],
  hp: "90",
  set: {
    id: "col1",
    name: "Call of Legends",
    series: "Call of Legends",
    releaseDate: "2011/02/09",
  },
  images: {
    small: "https://example.com/small.webp",
    large: "https://example.com/large.png",
  },
  variants: ["holo", "reverse"],
};

const pokewalletEntry: PriceEntry = {
  usd: 137.49,
  eur: null,
  updatedAt: "2026-08-20",
  source: "pokewallet",
  variants: {
    holo: { usd: 172.83, eur: null, updatedAt: "2026-08-20", source: "pokewallet" },
    reverse: { usd: 137.49, eur: null, updatedAt: "2026-08-20", source: "pokewallet" },
  },
};

assert.equal(resolvePriceStorageVariant("col1-22", "holo"), "reverse");
assert.equal(resolvePriceStorageVariant("col1-22", "reverse"), "holo");
assert.equal(resolvePriceStorageVariant("xy7-22", "holo"), "holo");

assert.equal(migrateOwnershipVariant("col1-22", "reverse"), "holo");
assert.equal(migrateOwnershipVariant("col1-22", "holo"), "reverse");
assert.equal(migrateOwnershipVariant("col1-22", "normal"), null);
assert.equal(migrateOwnershipVariant("xy7-22", "holo"), "holo");
assert.equal(migrateOwnershipVariant("bwp-2012", "normal"), "jumbo");
assert.equal(migrateOwnershipVariant("bwp-2012", "jumbo"), "jumbo");
assert.equal(migrateOwnershipVariant("smp-jp-zeraora-jumbo", "normal"), "jumbo");
assert.equal(migrateOwnershipVariant("smp-jp-zeraora-jumbo", "jumbo"), "jumbo");

const catalogueEntry = remapPriceEntryVariantsToCatalogue("col1-22", pokewalletEntry);
assert.equal(catalogueEntry.variants?.holo?.usd, 137.49);
assert.equal(catalogueEntry.variants?.reverse?.usd, 172.83);

const holoPrice = getPriceForCard(colUmbreon, "holo", {
  meta: { ratesUpdatedAt: "" },
  entries: { "col1-22": catalogueEntry },
});
assert.equal(holoPrice.usd, 137.49);

const reversePrice = getPriceForCard(colUmbreon, "reverse", {
  meta: { ratesUpdatedAt: "" },
  entries: { "col1-22": catalogueEntry },
});
assert.equal(reversePrice.usd, 172.83);

const rows = expandEntryToVariantRows("col1-22", catalogueEntry, ["holo", "reverse"], {
  card: colUmbreon,
});
const byVariant = Object.fromEntries(rows.map((r) => [r.variant, r.usd]));
assert.equal(byVariant.holo, 137.49);
assert.equal(byVariant.reverse, 172.83);

const holoRecord = getVariantPriceRecord(colUmbreon, "holo", catalogueEntry);
assert.equal(holoRecord?.usd, 137.49);

console.log("variant-catalogue-fixes: ok");

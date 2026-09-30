/**
 * Tests for targeted catalogue variant / price storage fixes.
 */

import assert from "node:assert/strict";
import cardsData from "../data/cards.json";
import { getPriceForCard, getVariantPriceRecord, shouldMergeNormalOntoHolo } from "../lib/cards";
import { mergeCatalogueCards } from "../lib/merge-catalogue";
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
assert.equal(resolvePriceStorageVariant("30c-116", "holo"), "normal");
assert.equal(resolvePriceStorageVariant("30c-116", "cosmos"), "holo");

assert.equal(migrateOwnershipVariant("col1-22", "reverse"), "holo");
assert.equal(migrateOwnershipVariant("col1-22", "holo"), "reverse");
assert.equal(migrateOwnershipVariant("col1-22", "normal"), null);
assert.equal(migrateOwnershipVariant("xy7-22", "holo"), "holo");
assert.equal(migrateOwnershipVariant("bwp-2012", "normal"), "jumbo");
assert.equal(migrateOwnershipVariant("bwp-2012", "jumbo"), "jumbo");
assert.equal(migrateOwnershipVariant("smp-jp-zeraora-jumbo", "normal"), "jumbo");
assert.equal(migrateOwnershipVariant("smp-jp-zeraora-jumbo", "jumbo"), "jumbo");
assert.equal(migrateOwnershipVariant("30c-116", "normal"), "holo");
assert.equal(migrateOwnershipVariant("30c-116", "holo"), "cosmos");
assert.equal(migrateOwnershipVariant("30c-116", "cosmos"), "cosmos");
assert.equal(migrateOwnershipVariant("swshp-SWSH129", "normal"), "holo");
assert.equal(migrateOwnershipVariant("swshp-SWSH129", "holo"), "holo");

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

const eevee116: PokemonCard = {
  ...colUmbreon,
  id: "30c-116",
  name: "Eevee",
  number: "116",
  variants: ["holo", "cosmos"],
};

const eevee116Pw: PriceEntry = {
  usd: 0.39,
  eur: 0.5,
  updatedAt: "2026-09-19",
  source: "pokewallet",
  variants: {
    holo: { usd: 0.39, eur: null, updatedAt: "2026-09-19", source: "pokewallet" },
    normal: { usd: null, eur: 0.5, updatedAt: "2026-09-19", source: "pokewallet" },
  },
};

const eevee116Catalogue = remapPriceEntryVariantsToCatalogue("30c-116", eevee116Pw);
assert.equal(eevee116Catalogue.variants?.holo?.eur, 0.5);
assert.equal(eevee116Catalogue.variants?.cosmos?.usd, 0.39);
assert.equal(eevee116Catalogue.variants?.normal, undefined);
assert.equal(getPriceForCard(eevee116, "holo", {
  meta: { ratesUpdatedAt: "" },
  entries: { "30c-116": eevee116Catalogue },
}).eur, 0.5);
assert.equal(getPriceForCard(eevee116, "cosmos", {
  meta: { ratesUpdatedAt: "" },
  entries: { "30c-116": eevee116Catalogue },
}).usd, 0.39);

const swsh129FromFile = (cardsData as PokemonCard[]).find(
  (card) => card.id === "swshp-SWSH129"
);
assert.ok(swsh129FromFile);
assert.deepEqual(swsh129FromFile.variants, ["holo"]);
assert.equal(shouldMergeNormalOntoHolo(swsh129FromFile), true);

const { cards: mergedWithSpuriousNormal } = mergeCatalogueCards([
  { ...swsh129FromFile, variants: ["normal", "holo"] },
]);
assert.deepEqual(
  mergedWithSpuriousNormal.find((card) => card.id === "swshp-SWSH129")?.variants,
  ["holo"]
);

const swsh129Pw: PriceEntry = {
  usd: 19.67,
  eur: 11.44,
  updatedAt: "2026-09-30",
  source: "pokewallet",
  variants: {
    holo: { usd: 19.67, eur: null, updatedAt: "2026-09-30", source: "pokewallet" },
    normal: { usd: null, eur: 11.44, updatedAt: "2026-09-30", source: "pokewallet" },
  },
};
const swsh129MergedPrice = getPriceForCard(swsh129FromFile, "holo", {
  meta: { ratesUpdatedAt: "" },
  entries: { "swshp-SWSH129": swsh129Pw },
});
assert.equal(swsh129MergedPrice.usd, 19.67);
assert.equal(swsh129MergedPrice.eur, 11.44);

console.log("variant-catalogue-fixes: ok");

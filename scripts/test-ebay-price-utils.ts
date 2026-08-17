/**
 * Offline tests for eBay listing matching and asking-median estimation.
 */

import assert from "node:assert/strict";
import type { EbayPriceMapping } from "../lib/ebay-price-mappings";
import { metaToExchangeRates } from "../lib/exchange-rates";
import type { EbayBrowseItemSummary } from "./ebay-browse-client";
import {
  estimateEbayAskingMedian,
  filterIqrOutliers,
  matchesEbayListingTitle,
  median,
} from "./ebay-price-utils";

const mapping: EbayPriceMapping = {
  cardId: "ecard2-11",
  variant: "jumbo",
  marketplaceId: "EBAY_US",
  requiredTerms: ["espeon", "aquapolis"],
  preferredTerms: ["jumbo", "11"],
  excludedTerms: ["h9", "reverse", "graded", "lot", "psa", "bgs", "cgc", "sgc"],
  minSamples: 2,
  mappingVersion: "test",
  queries: ["Espeon Aquapolis 11 jumbo"],
};

const items: EbayBrowseItemSummary[] = [
  {
    itemId: "1",
    title: "Pokemon Espeon Aquapolis 11 Jumbo Oversized Holo",
    price: { value: "100.00", currency: "USD" },
    shippingOptions: [{ shippingCost: { value: "5.00", currency: "USD" } }],
    buyingOptions: ["FIXED_PRICE"],
  },
  {
    itemId: "2",
    title: "Espeon Aquapolis #11 Jumbo Card",
    price: { value: "120.00", currency: "USD" },
    shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" } }],
    buyingOptions: ["FIXED_PRICE"],
  },
  {
    itemId: "3",
    title: "Espeon Aquapolis 11 Oversized",
    price: { value: "110.00", currency: "USD" },
    buyingOptions: ["FIXED_PRICE"],
  },
  {
    itemId: "4",
    title: "Espeon Aquapolis H9 Reverse Holo",
    price: { value: "20.00", currency: "USD" },
    buyingOptions: ["FIXED_PRICE"],
  },
  {
    itemId: "5",
    title: "Espeon Aquapolis 11 Jumbo PSA 10",
    price: { value: "500.00", currency: "USD" },
    buyingOptions: ["FIXED_PRICE"],
  },
  {
    itemId: "6",
    title: "Espeon Aquapolis 11 Jumbo Lot of 3",
    price: { value: "90.00", currency: "USD" },
    buyingOptions: ["FIXED_PRICE"],
  },
];

assert.equal(
  matchesEbayListingTitle("Espeon Aquapolis 11 Jumbo", mapping).ok,
  true
);
assert.equal(
  matchesEbayListingTitle("Espeon Aquapolis H9 Reverse", mapping).ok,
  false
);

assert.deepEqual(filterIqrOutliers([10, 11, 12, 13, 100]), [10, 11, 12, 13]);
assert.equal(median([10, 20, 30]), 20);

const estimate = estimateEbayAskingMedian({
  items,
  mapping,
  rates: metaToExchangeRates({ ratesUpdatedAt: "2026-08-17", usdRates: { EUR: 0.92, HUF: 360, GBP: 0.79 } }),
  updatedAt: "2026-08-17",
});

assert.equal(estimate.accepted.length, 3);
assert.equal(estimate.rejected.length, 3);
assert.ok(estimate.record);
assert.equal(estimate.record?.source, "ebay");
assert.equal(estimate.record?.priceKind, "active_listing_median");
assert.equal(estimate.record?.sampleCount, 3);
assert.ok((estimate.record?.usd ?? 0) > 100);

const twoListings = estimateEbayAskingMedian({
  items: items.slice(0, 2),
  mapping,
  rates: metaToExchangeRates({ ratesUpdatedAt: "2026-08-17", usdRates: { EUR: 0.92, HUF: 360, GBP: 0.79 } }),
  updatedAt: "2026-08-17",
});
assert.ok(twoListings.record);
assert.equal(twoListings.record?.sampleCount, 2);

const insufficient = estimateEbayAskingMedian({
  items: items.slice(0, 1),
  mapping,
  rates: metaToExchangeRates({ ratesUpdatedAt: "2026-08-17", usdRates: { EUR: 0.92, HUF: 360, GBP: 0.79 } }),
  updatedAt: "2026-08-17",
});
assert.equal(insufficient.record, null);

console.log("test-ebay-price-utils: ok");

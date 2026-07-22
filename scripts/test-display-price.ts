/**
 * Display price resolver checks for resolveDisplayAmount / formatDisplayPrice.
 * Run with: npm run test:display-price
 */

import type { ResolvedPrice } from "../lib/cards";
import {
  formatDisplayPrice,
  formatPriceChipTooltip,
  resolveDisplayAmount,
  resolveListingPrice,
} from "../lib/display-price";
import type { ExchangeRates } from "../lib/exchange-rates";
import type { PokemonCard, PricesSnapshot } from "../types";

const rates: ExchangeRates = {
  eurUsdRate: 1.08,
  ratesUpdatedAt: "2026-07-21",
  usdRates: { EUR: 0.9259, HUF: 360, GBP: 0.79 },
};

type Case = {
  label: string;
  price: ResolvedPrice;
  currency: "USD" | "EUR" | "HUF" | "GBP";
  expectedAmount: number | null;
  expectedSource: "native-usd" | "native-eur" | "converted" | null;
};

const cases: Case[] = [
  {
    label: "USD native",
    price: { usd: 15.9, eur: 3.66 },
    currency: "USD",
    expectedAmount: 15.9,
    expectedSource: "native-usd",
  },
  {
    label: "USD from EUR",
    price: { usd: null, eur: 113.74 },
    currency: "USD",
    expectedAmount: 113.74 * 1.08,
    expectedSource: "converted",
  },
  {
    label: "EUR native",
    price: { usd: 15.9, eur: 3.66 },
    currency: "EUR",
    expectedAmount: 3.66,
    expectedSource: "native-eur",
  },
  {
    label: "EUR from USD (1st Edition style)",
    price: { usd: 15.9, eur: null },
    currency: "EUR",
    expectedAmount: 15.9 / 1.08,
    expectedSource: "converted",
  },
  {
    label: "HUF from native EUR",
    price: { usd: null, eur: 100 },
    currency: "HUF",
    expectedAmount: 100 * (360 / 0.9259),
    expectedSource: "native-eur",
  },
  {
    label: "HUF from USD only",
    price: { usd: 10, eur: null },
    currency: "HUF",
    expectedAmount: 10 * 360,
    expectedSource: "converted",
  },
  {
    label: "GBP from USD",
    price: { usd: 12, eur: null },
    currency: "GBP",
    expectedAmount: 12 * 0.79,
    expectedSource: "converted",
  },
  {
    label: "both null",
    price: { usd: null, eur: null },
    currency: "USD",
    expectedAmount: null,
    expectedSource: null,
  },
  {
    label: "HUF falls back to USD when EUR is zero",
    price: { usd: 21.56, eur: 0 },
    currency: "HUF",
    expectedAmount: 21.56 * 360,
    expectedSource: "converted",
  },
  {
    label: "EUR falls back to USD when EUR is zero",
    price: { usd: 21.56, eur: 0 },
    currency: "EUR",
    expectedAmount: 21.56 / 1.08,
    expectedSource: "converted",
  },
];

function approx(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.02;
}

let failed = 0;
for (const c of cases) {
  const got = resolveDisplayAmount(c.price, c.currency, rates);
  const amountOk =
    c.expectedAmount == null
      ? got.amount == null
      : got.amount != null && approx(got.amount, c.expectedAmount);
  const sourceOk = got.source === c.expectedSource;
  if (!amountOk || !sourceOk) {
    failed++;
    console.error(
      `FAIL ${c.label}: expected amount=${c.expectedAmount} source=${c.expectedSource}, got ${JSON.stringify(got)}`
    );
  }
}

if (formatDisplayPrice(null, "USD") !== "$ N/A") {
  failed++;
  console.error("FAIL formatDisplayPrice null USD");
}

const hufFormatted = formatDisplayPrice(12345, "HUF");
if (!hufFormatted.includes("12") || hufFormatted.includes(",00")) {
  failed++;
  console.error(`FAIL formatDisplayPrice HUF: ${hufFormatted}`);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`All ${cases.length + 2} display price checks passed.`);

const basep11: PokemonCard = {
  id: "basep-11",
  name: "Eevee",
  number: "11",
  rarity: "Common",
  supertype: "Pokémon",
  set: {
    id: "basep",
    name: "Wizards Black Star Promos",
    series: "Base",
    releaseDate: "1999/07/01",
  },
  images: { small: "", large: "" },
  variants: ["normal", "holo"],
};

const multiVariantSnapshot: PricesSnapshot = {
  meta: { ratesUpdatedAt: "2026-07-21" },
  entries: {
    "basep-11": {
      usd: 43.72,
      eur: null,
      updatedAt: "2026-07-21",
      variants: {
        normal: { usd: null, eur: null },
        holo: { usd: 43.72, eur: null },
      },
    },
    "base2-51": {
      usd: 3.46,
      eur: 3.66,
      updatedAt: "2026-07-21",
      variants: {
        normal: { usd: 3.46, eur: 3.66 },
        firstEdition: { usd: 15.9, eur: null },
      },
    },
    "sv8pt5-5": {
      usd: 0.35,
      eur: 0.18,
      updatedAt: "2026-07-21",
      variants: {
        holo: { usd: 0.32, eur: 0.3 },
        reverse: { usd: 0.35, eur: null },
        pokeball: { usd: 12.0, eur: 10.5 },
      },
    },
    "test-lowest": {
      usd: null,
      eur: null,
      updatedAt: "2026-07-21",
      variants: {
        normal: { usd: null, eur: null },
        reverse: { usd: 0.35, eur: null },
        holo: { usd: 0.32, eur: 0.3 },
      },
    },
  },
};

const base2_51: PokemonCard = {
  id: "base2-51",
  name: "Eevee",
  number: "51",
  rarity: "Common",
  supertype: "Pokémon",
  set: { id: "base2", name: "Jungle", series: "Base", releaseDate: "1999/06/16" },
  images: { small: "", large: "" },
  variants: ["normal", "firstEdition"],
};

type ListingCase = {
  label: string;
  card: PokemonCard;
  currency: "USD" | "HUF";
  expectedVariant: string;
  expectedFallback: boolean;
  expectedAmount: number | null;
};

const lowestPickCard: PokemonCard = {
  id: "test-lowest",
  name: "Test Lowest",
  number: "1",
  rarity: "Rare",
  supertype: "Pokémon",
  set: { id: "test", name: "Test", series: "Test", releaseDate: "2020/01/01" },
  images: { small: "", large: "" },
  variants: ["normal", "reverse", "holo"],
};

const listingCases: ListingCase[] = [
  {
    label: "default variant priced (no fallback)",
    card: base2_51,
    currency: "USD",
    expectedVariant: "normal",
    expectedFallback: false,
    expectedAmount: 3.46,
  },
  {
    label: "normal N/A falls back to holo (basep-11 style)",
    card: basep11,
    currency: "HUF",
    expectedVariant: "holo",
    expectedFallback: true,
    expectedAmount: 43.72 * 360,
  },
  {
    label: "lowest priced variant when default missing",
    card: lowestPickCard,
    currency: "USD",
    expectedVariant: "holo",
    expectedFallback: true,
    expectedAmount: 0.32,
  },
  {
    label: "no price anywhere stays N/A",
    card: {
      ...basep11,
      id: "empty-card",
      variants: ["normal", "holo"],
    },
    currency: "USD",
    expectedVariant: "normal",
    expectedFallback: false,
    expectedAmount: null,
  },
];

let listingFailed = 0;
for (const c of listingCases) {
  const snapshot =
    c.card.id === "empty-card"
      ? { meta: multiVariantSnapshot.meta, entries: {} }
      : multiVariantSnapshot;
  const got = resolveListingPrice(c.card, snapshot, c.currency, rates);
  const amountOk =
    c.expectedAmount == null
      ? got.display.amount == null
      : got.display.amount != null && approx(got.display.amount, c.expectedAmount);
  const variantOk = got.variant === c.expectedVariant;
  const fallbackOk = got.isFallback === c.expectedFallback;
  if (!amountOk || !variantOk || !fallbackOk) {
    listingFailed++;
    console.error(
      `FAIL listing ${c.label}: expected variant=${c.expectedVariant} fallback=${c.expectedFallback} amount=${c.expectedAmount}, got ${JSON.stringify(got)}`
    );
  }
}

if (listingFailed > 0) {
  console.error(`\n${listingFailed} listing test(s) failed.`);
  process.exit(1);
}

console.log(`All ${listingCases.length} listing price checks passed.`);

type TooltipCase = {
  label: string;
  input: Parameters<typeof formatPriceChipTooltip>[0];
  expectIncludes: string[];
  expectExcludes?: string[];
};

const tooltipCases: TooltipCase[] = [
  {
    label: "pokewallet fetched date",
    input: { updatedAt: "2026-07-21", source: "pokewallet" },
    expectIncludes: ["Fetched", "2026"],
  },
  {
    label: "manual entered date",
    input: { updatedAt: "2026-03-15", source: "manual" },
    expectIncludes: ["Entered manually", "2026"],
  },
  {
    label: "missing date",
    input: { source: "pokewallet" },
    expectIncludes: ["Fetched"],
    expectExcludes: ["2026"],
  },
  {
    label: "fallback variant prefix",
    input: {
      updatedAt: "2026-07-21",
      source: "pokewallet",
      fallbackVariantLabel: "Holofoil",
    },
    expectIncludes: ["Holofoil", "Fetched", "2026"],
  },
  {
    label: "empty price",
    input: { isEmpty: true, currency: "HUF" },
    expectIncludes: ["No price available in HUF"],
  },
];

let tooltipFailed = 0;
for (const c of tooltipCases) {
  const got = formatPriceChipTooltip(c.input) ?? "";
  const includesOk = c.expectIncludes.every((part) => got.includes(part));
  const excludesOk = (c.expectExcludes ?? []).every((part) => !got.includes(part));
  if (!includesOk || !excludesOk) {
    tooltipFailed++;
    console.error(`FAIL tooltip ${c.label}: got "${got}"`);
  }
}

if (tooltipFailed > 0) {
  console.error(`\n${tooltipFailed} tooltip test(s) failed.`);
  process.exit(1);
}

console.log(`All ${tooltipCases.length} price chip tooltip checks passed.`);

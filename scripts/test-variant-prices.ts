/**
 * Strict variant price lookup checks for getPriceForCard.
 * Run with: npm run test:variant-prices
 */

import { getPriceForCard } from "../lib/cards";
import type { PokemonCard, PricesSnapshot } from "../types";

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

const sv8pt5_5: PokemonCard = {
  id: "sv8pt5-5",
  name: "Leafeon",
  number: "5",
  rarity: "Rare",
  supertype: "Pokémon",
  set: {
    id: "sv8pt5",
    name: "Prismatic Evolutions",
    series: "Scarlet & Violet",
    releaseDate: "2025/01/17",
  },
  images: { small: "", large: "" },
  variants: ["holo", "reverse", "pokeball"],
};

const swsh9tg_TG23: PokemonCard = {
  id: "swsh9tg-TG23",
  name: "Umbreon VMAX",
  number: "TG23",
  rarity: "Rare Holo VMAX",
  supertype: "Pokémon",
  set: {
    id: "swsh9tg",
    name: "Brilliant Stars Trainer Gallery",
    series: "Sword & Shield",
    releaseDate: "2022/02/25",
  },
  images: { small: "", large: "" },
  variants: ["holo"],
};

const holoOnlyNormalPriced: PokemonCard = {
  id: "test-holo-only",
  name: "Test Holo Only",
  number: "1",
  rarity: "Rare",
  supertype: "Pokémon",
  set: { id: "test", name: "Test", series: "Test", releaseDate: "2020/01/01" },
  images: { small: "", large: "" },
  variants: ["normal"],
};

const swsh7_169: PokemonCard = {
  id: "swsh7-169",
  name: "Flareon V",
  number: "169",
  rarity: "Ultra Rare",
  supertype: "Pokémon",
  set: {
    id: "swsh7",
    name: "Evolving Skies",
    series: "Sword & Shield",
    releaseDate: "2021/08/27",
  },
  images: { small: "", large: "" },
  variants: ["holo"],
};

const snapshot: PricesSnapshot = {
  meta: { ratesUpdatedAt: "2026-07-21", usdRates: { EUR: 0.9259, HUF: 360, GBP: 0.79 } },
  entries: {
    "base2-51": {
      usd: 3.46,
      eur: 3.66,
      updatedAt: "2026-07-21",
      variants: {
        normal: { usd: 3.46, eur: 3.66 },
        firstEdition: { usd: 15.9, eur: null },
        holo: { usd: null, eur: 2.88 },
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
    "swsh9tg-TG23": {
      usd: null,
      eur: null,
      updatedAt: "2026-07-21",
      variants: {
        normal: { usd: null, eur: 113.74 },
      },
    },
    "test-holo-only": {
      usd: null,
      eur: null,
      updatedAt: "2026-07-21",
      variants: {
        holo: { usd: 5.5, eur: 4.2 },
      },
    },
    "test-holo-empty": {
      usd: null,
      eur: null,
      updatedAt: "2026-07-21",
      variants: {},
    },
    "swsh7-169": {
      usd: 21.56,
      eur: 22.13,
      updatedAt: "2026-07-21",
      variants: {
        holo: { usd: 21.56, eur: 0 },
        normal: { usd: null, eur: 22.13 },
      },
    },
  },
};

type Case = {
  label: string;
  card: PokemonCard;
  variant: string;
  expected: { usd: number | null; eur: number | null };
  snapshotKey?: "default" | "noPokeball" | "empty";
};

const cases: Case[] = [
  {
    label: "firstEdition USD only",
    card: base2_51,
    variant: "firstEdition",
    expected: { usd: 15.9, eur: null },
  },
  {
    label: "firstEdition does not fall back to normal EUR",
    card: base2_51,
    variant: "firstEdition",
    expected: { usd: 15.9, eur: null },
  },
  {
    label: "normal both sides",
    card: base2_51,
    variant: "normal",
    expected: { usd: 3.46, eur: 3.66 },
  },
  {
    label: "missing variant key (pokeball on base2-51)",
    card: base2_51,
    variant: "pokeball",
    expected: { usd: null, eur: null },
  },
  {
    label: "reverse does not bleed holo when reverse absent on other card",
    card: base2_51,
    variant: "reverse",
    expected: { usd: null, eur: null },
  },
  {
    label: "manual pokeball in JSON",
    card: sv8pt5_5,
    variant: "pokeball",
    expected: { usd: 12.0, eur: 10.5 },
  },
  {
    label: "TG23 holo aliases to normal EUR (single-variant)",
    card: swsh9tg_TG23,
    variant: "holo",
    expected: { usd: null, eur: 113.74 },
  },
  {
    label: "multi-variant firstEdition still strict (no normal EUR alias)",
    card: base2_51,
    variant: "firstEdition",
    expected: { usd: 15.9, eur: null },
  },
  {
    label: "single-variant normal aliases to holo when only holo priced",
    card: holoOnlyNormalPriced,
    variant: "normal",
    expected: { usd: 5.5, eur: 4.2 },
  },
  {
    label: "single-variant holo empty variantsJson stays N/A",
    card: swsh9tg_TG23,
    variant: "holo",
    expected: { usd: null, eur: null },
    snapshotKey: "empty" as const,
  },
  {
    label: "holo USD only when holo EUR is zero (Flareon V style)",
    card: swsh7_169,
    variant: "holo",
    expected: { usd: 21.56, eur: null },
  },
];

// Card with no pokeball in a separate snapshot
const snapshotNoPokeball: PricesSnapshot = {
  meta: snapshot.meta,
  entries: {
    "sv8pt5-5": {
      usd: 0.35,
      eur: 0.18,
      updatedAt: "2026-07-21",
      variants: {
        holo: { usd: 0.32, eur: 0.3 },
        reverse: { usd: 0.35, eur: null },
      },
    },
  },
};

cases.push({
  label: "pokeball key absent",
  card: sv8pt5_5,
  variant: "pokeball",
  expected: { usd: null, eur: null },
  snapshotKey: "noPokeball",
});

const snapshotEmptyVariants: PricesSnapshot = {
  meta: snapshot.meta,
  entries: {
    "swsh9tg-TG23": {
      usd: null,
      eur: null,
      updatedAt: "2026-07-21",
      variants: {},
    },
  },
};

function pickSnapshot(c: Case): PricesSnapshot {
  if (c.snapshotKey === "noPokeball") return snapshotNoPokeball;
  if (c.snapshotKey === "empty") return snapshotEmptyVariants;
  return snapshot;
}

let failed = 0;
for (const c of cases) {
  const got = getPriceForCard(c.card, c.variant, pickSnapshot(c));
  const ok = got.usd === c.expected.usd && got.eur === c.expected.eur;
  if (!ok) {
    failed++;
    console.error(
      `FAIL ${c.label}: expected ${JSON.stringify(c.expected)}, got ${JSON.stringify(got)}`
    );
  }
}

// Row-level fallback must not apply when variant key missing
const rowOnly = getPriceForCard(base2_51, "reverse", {
  meta: snapshot.meta,
  entries: {
    "base2-51": {
      usd: 99,
      eur: 88,
      updatedAt: "2026-07-21",
      variants: {
        normal: { usd: 3.46, eur: 3.66 },
      },
    },
  },
});
if (rowOnly.usd !== null || rowOnly.eur !== null) {
  failed++;
  console.error(
    `FAIL row-level fallback blocked: expected null/null, got ${JSON.stringify(rowOnly)}`
  );
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`All ${cases.length + 1} variant price checks passed.`);

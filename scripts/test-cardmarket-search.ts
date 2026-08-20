/**
 * Marketplace search URL / number normalization checks.
 * Run with: npm run test:cardmarket-search
 */

import {
  getCardmarketSearchUrl,
  getEbaySearchUrl,
  getTcgPlayerSearchUrl,
  normalizeCardNumberForCardmarket,
  searchNumberForCard,
} from "../lib/marketplace-search";
import type { PokemonCardSet } from "../types";

const cbb2cSet: PokemonCardSet = {
  id: "cbb2c",
  name: "Gem Pack Vol. 2",
  series: "Other",
  releaseDate: "2025/05/16",
};

const jungleSet: PokemonCardSet = {
  id: "base2",
  name: "Jungle",
  series: "Base",
  releaseDate: "1999/06/16",
};

const mcdSet: PokemonCardSet = {
  id: "mcd19",
  name: "McDonald's Collection 2019",
  series: "Other",
  releaseDate: "2019/01/01",
};

type NormalizeCase = { input: string; expected: string };

const normalizeCases: NormalizeCase[] = [
  { input: "4", expected: "4" },
  { input: "004", expected: "4" },
  { input: "12", expected: "12" },
  { input: "H09", expected: "H9" },
  { input: "XY04", expected: "XY4" },
  { input: "01 01/15", expected: "1 1/15" },
  { input: "RC14", expected: "RC14" },
  { input: "BW87", expected: "BW87" },
  { input: " 004 ", expected: "4" },
];

let failed = 0;

function check(label: string, ok: boolean) {
  if (!ok) {
    console.error(`FAIL: ${label}`);
    failed++;
  }
}

for (const { input, expected } of normalizeCases) {
  const actual = normalizeCardNumberForCardmarket(input);
  check(`normalize "${input}" -> "${actual}" (expected "${expected}")`, actual === expected);
}

check(
  "cbb2c Penny line number",
  searchNumberForCard({ name: "Penny", number: "10 04/04", set: cbb2cSet }) === "10"
);

check(
  "cbb2c Eevee line number",
  searchNumberForCard({ name: "Eevee", number: "01 01/15", set: cbb2cSet }) === "01"
);

check(
  "non-cbb2c keeps full number",
  searchNumberForCard({ name: "Pikachu", number: "01 01/15", set: mcdSet }) === "01 01/15"
);

const jolteonCm = getCardmarketSearchUrl({
  name: "Jolteon",
  number: "4",
  set: jungleSet,
});
check("Jolteon Cardmarket URL", jolteonCm.includes("searchString=Jolteon%204"));
check("Jolteon no padded 004", !jolteonCm.includes("004"));
check("Jolteon no set name", !jolteonCm.includes("Jungle"));

const pennyCm = getCardmarketSearchUrl({
  name: "Penny",
  number: "10 04/04",
  set: cbb2cSet,
});
check("Penny Cardmarket URL", pennyCm.includes(encodeURIComponent("Penny 10")));
check("Penny no fraction", !pennyCm.includes("04%2F04") && !pennyCm.includes("4/4"));

const pennyTcg = getTcgPlayerSearchUrl({
  name: "Penny",
  number: "10 04/04",
  set: cbb2cSet,
});
check("Penny TCGplayer URL", pennyTcg.includes(encodeURIComponent("Penny 10")));
check("Penny TCG no set", !pennyTcg.includes("Gem"));

const pennyEbay = getEbaySearchUrl({
  name: "Penny",
  number: "10 04/04",
  set: cbb2cSet,
});
check("Penny eBay URL", pennyEbay.includes(encodeURIComponent("Penny 10 04/04")));
check("Penny eBay full fraction", pennyEbay.includes("04%2F04"));
check("Penny eBay no set", !pennyEbay.includes("Gem"));

const zeraoraEbay = getEbaySearchUrl(
  {
    id: "smp-jp-zeraora-jumbo",
    name: "Zeraora and Friends",
    number: "-",
    set: {
      id: "smp-jp",
      name: "SM-P Promos",
      series: "Sun & Moon",
      releaseDate: "2017/03/01",
    },
  },
  "jumbo"
);
check(
  "Zeraora jumbo eBay URL uses mapped query",
  zeraoraEbay.includes(encodeURIComponent("SM-P Zeraora and Friends Jumbo pokemon card"))
);

const mcdUrl = getCardmarketSearchUrl({
  name: "Pikachu",
  number: "01 01/15",
  set: mcdSet,
});
check("McDonald's Cardmarket URL", mcdUrl.includes(encodeURIComponent("Pikachu 1 1/15")));

if (failed === 0) {
  console.log("All marketplace-search checks passed.");
} else {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}

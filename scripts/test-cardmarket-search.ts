/**
 * Cardmarket search URL / number normalization checks.
 * Run with: npm run test:cardmarket-search
 */

import {
  getCardmarketSearchUrl,
  normalizeCardNumberForCardmarket,
} from "../lib/cardmarket-search";

type NormalizeCase = {
  input: string;
  expected: string;
};

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

for (const { input, expected } of normalizeCases) {
  const actual = normalizeCardNumberForCardmarket(input);
  if (actual !== expected) {
    console.error(`FAIL normalize: "${input}" -> "${actual}" (expected "${expected}")`);
    failed++;
  }
}

const jolteonUrl = getCardmarketSearchUrl({ name: "Jolteon", number: "4" });
if (!jolteonUrl.includes("searchString=Jolteon%204")) {
  console.error(`FAIL URL: Jolteon 4 -> ${jolteonUrl}`);
  failed++;
}
if (jolteonUrl.includes("004")) {
  console.error(`FAIL URL: should not contain padded 004 -> ${jolteonUrl}`);
  failed++;
}

const mcdUrl = getCardmarketSearchUrl({ name: "Pikachu", number: "01 01/15" });
if (!mcdUrl.includes(encodeURIComponent("Pikachu 1 1/15"))) {
  console.error(`FAIL URL: McDonald's format -> ${mcdUrl}`);
  failed++;
}

if (failed === 0) {
  console.log(`All ${normalizeCases.length + 2} cardmarket-search checks passed.`);
} else {
  console.error(`${failed} check(s) failed.`);
  process.exit(1);
}

/**
 * Quick checks for lib/parse-price.ts
 * Run with: npm run test:parse-price
 */

import { parsePriceCell } from "../lib/parse-price";
import { parseEurUsdRate } from "../lib/price-entry-utils";

const cases: Array<{ input: unknown; expected: number | null; label?: string }> = [
  { input: "96,61", expected: 96.61 },
  { input: "96.61", expected: 96.61 },
  { input: "9661", expected: 9661 },
  { input: "1,234.56", expected: 1234.56 },
  { input: "1.234,56", expected: 1234.56 },
  { input: "68,59", expected: 68.59 },
  { input: "143,56", expected: 143.56 },
  { input: "$96.61", expected: 96.61 },
  { input: 96, expected: 96 },
  { input: null, expected: null },
  { input: "", expected: null },
  { input: "1,234", expected: 1234 },
  { input: "€68,59", expected: 68.59 },
  { input: 0, expected: null },
  { input: "0", expected: null },
];

let failed = 0;
for (const { input, expected, label } of cases) {
  const got = parsePriceCell(input);
  const ok =
    got === expected ||
    (typeof got === "number" &&
      typeof expected === "number" &&
      Math.abs(got - expected) < 1e-9);
  if (!ok) {
    failed++;
    console.error(
      `FAIL ${label ?? JSON.stringify(input)}: expected ${expected}, got ${got}`
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`All ${cases.length} parsePriceCell checks passed.`);

const rateCases: Array<{ input: unknown; expected: number }> = [
  { input: "1.08", expected: 1.08 },
  { input: "1,08", expected: 1.08 },
  { input: "11435", expected: 1.1435 },
  { input: 11435, expected: 1.1435 },
  { input: null, expected: 1.08 },
  { input: "99999", expected: 1.08 },
];

for (const { input, expected } of rateCases) {
  const got = parseEurUsdRate(input);
  const ok = Math.abs(got - expected) < 1e-9;
  if (!ok) {
    console.error(`FAIL rate ${JSON.stringify(input)}: expected ${expected}, got ${got}`);
    process.exit(1);
  }
}

console.log(`All ${rateCases.length} parseEurUsdRate checks passed.`);

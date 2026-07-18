/**
 * Scaffold EUR price slots for CBB2C manual cards in data/manual-prices.json.
 * Adds missing cbb2c-* keys only; does not overwrite existing prices.
 *
 * Run with: npx tsx scripts/scaffold-cbb2c-manual-prices.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";

type ManualPriceEntry = {
  eur?: number;
  usd?: number;
  variants?: Record<string, { eur?: number; usd?: number }>;
};

function cbb2cNumericSuffix(id: string): number {
  return parseInt(id.slice("cbb2c-".length), 10);
}

function sortCbb2cIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => cbb2cNumericSuffix(a) - cbb2cNumericSuffix(b));
}

async function main() {
  const manualCardsPath = path.join(process.cwd(), "data", "manual-cards.json");
  const pricesPath = path.join(process.cwd(), "data", "manual-prices.json");

  const manualCardsRaw = await fs.readFile(manualCardsPath, "utf8");
  const manualCards = JSON.parse(manualCardsRaw) as PokemonCard[];

  const cbb2cIds = sortCbb2cIds(
    manualCards.filter((c) => c.id.startsWith("cbb2c-")).map((c) => c.id)
  );

  if (cbb2cIds.length === 0) {
    throw new Error("No cbb2c-* cards found in data/manual-cards.json");
  }

  const pricesRaw = await fs.readFile(pricesPath, "utf8");
  const prices = JSON.parse(pricesRaw) as Record<string, ManualPriceEntry>;

  let added = 0;
  for (const id of cbb2cIds) {
    if (!(id in prices)) {
      prices[id] = { eur: 0 };
      added++;
    }
  }

  const nonCbb2c = Object.entries(prices).filter(([key]) => !key.startsWith("cbb2c-"));
  const cbb2c = sortCbb2cIds(
    Object.keys(prices).filter((key) => key.startsWith("cbb2c-"))
  ).map((id) => [id, prices[id]] as const);

  const sorted = Object.fromEntries([...nonCbb2c, ...cbb2c]);
  await fs.writeFile(pricesPath, JSON.stringify(sorted, null, 2) + "\n", "utf8");

  console.log(`CBB2C cards in manual-cards.json: ${cbb2cIds.length}`);
  console.log(`Added ${added} new price slot(s) to ${pricesPath}`);
  console.log(`Total cbb2c-* price entries: ${cbb2c.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

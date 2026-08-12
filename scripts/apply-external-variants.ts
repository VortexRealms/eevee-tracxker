/**

 * Re-merge external + manual variants into committed data/cards.json

 * without re-fetching TCGdex. Run after editing *External.json or manual-cards.json.

 *

 *   npm run apply:catalogue-variants

 */



import fs from "node:fs/promises";

import path from "node:path";

import { getCatalogueSlotTarget } from "../lib/collection-target";

import { countVariantSlots } from "../lib/merge-variants";

import { mergeCatalogueCards } from "../lib/merge-catalogue";

import type { PokemonCard } from "../types";



async function main() {

  const cardsPath = path.join(process.cwd(), "data", "cards.json");

  const manualPath = path.join(process.cwd(), "data", "manual-cards.json");



  const cards = JSON.parse(await fs.readFile(cardsPath, "utf8")) as PokemonCard[];



  let manualCards: PokemonCard[] = [];

  try {

    manualCards = JSON.parse(await fs.readFile(manualPath, "utf8")) as PokemonCard[];

  } catch {

    console.log("No manual-cards.json — skipping manual merge.");

  }



  const { cards: merged, report } = mergeCatalogueCards(cards, manualCards);



  merged.sort((a, b) => {

    const dateA = a.set.releaseDate ?? "";

    const dateB = b.set.releaseDate ?? "";

    if (dateA !== dateB) return dateA.localeCompare(dateB);

    return a.number.localeCompare(b.number, "en", { numeric: true });

  });



  const slots = countVariantSlots(merged);

  await fs.writeFile(cardsPath, JSON.stringify(merged, null, 2), "utf8");



  console.log(`Updated ${merged.length} cards in data/cards.json`);

  console.log(`Variant slots: ${slots} (catalogue target ${getCatalogueSlotTarget(merged)})`);

  console.log(

    `External: ${report.variantsByCardId.size} cards, ${report.unmatched.length} unmatched, ${report.duplicateSkips} dup skips`

  );

  if (report.unmatched.length > 0) {

    console.log("\nUnmatched external entries:");

    for (const entry of report.unmatched) {

      console.log(`  - ${entry.name} · ${entry.setName} #${entry.number}`);

    }

  }

}



main().catch((err) => {

  console.error(err);

  process.exit(1);

});



/**
 * Fetches all Eevee / Eeveelution cards from the TCGdex API and saves them to
 * data/cards.json, using Pokémon TCG API-compatible card IDs so that existing
 * collection data stored in Google Sheets is not invalidated.
 *
 * Also fetches extra TCGdex cards listed in data/included-cards.json.
 * Cards not available in TCGdex (e.g. McDonald's promos) are sourced from the
 * committed data/manual-cards.json fallback file.
 *
 * Run with: npm run fetch:cards
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Query } from "@tcgdex/sdk";
import type { PokemonCard, PokemonName } from "../types";
import { buildCatalogueSlots } from "../lib/catalogue-slots";
import { countVariantSlots } from "../lib/merge-variants";
import { mergeCatalogueCards } from "../lib/merge-catalogue";
import { getCatalogueSlotTarget } from "../lib/collection-target";
import {
  chunk,
  getSetMeta,
  loadIncludedCardRefs,
  mapTcgdexCardToPokemon,
  resolveIncludedToTcgdexId,
  tcgdex,
} from "./tcgdex-card-utils";

const NAMES: PokemonName[] = [
  "Eevee",
  "Vaporeon",
  "Jolteon",
  "Flareon",
  "Espeon",
  "Umbreon",
  "Leafeon",
  "Glaceon",
  "Sylveon",
];

async function reportVariantMappingDrift(cards: PokemonCard[]): Promise<void> {
  const mappingPath = path.join(process.cwd(), "data", "variant-price-mappings.json");
  let mappingKeys = new Set<string>();
  try {
    const raw = await fs.readFile(mappingPath, "utf8");
    const parsed = JSON.parse(raw) as { cards?: Record<string, unknown> };
    mappingKeys = new Set(Object.keys(parsed.cards ?? {}));
  } catch {
    console.log("\nvariant-price-mappings.json not found — skipping mapping drift report.");
    return;
  }

  const catalogueKeys = new Set(
    buildCatalogueSlots(cards).map(({ card, variant }) => `${card.id}.${variant}`)
  );

  const staleKeys = [...mappingKeys].filter((key) => !catalogueKeys.has(key)).sort();
  const missingKeys = [...catalogueKeys].filter((key) => !mappingKeys.has(key)).sort();

  console.log("\nVariant mapping drift report (read-only; mappings file not modified):");
  console.log(`  Catalogue slots: ${catalogueKeys.size}`);
  console.log(`  Mapping entries: ${mappingKeys.size}`);
  console.log(`  Stale mapping keys (not in catalogue): ${staleKeys.length}`);
  console.log(`  Missing mapping keys (new catalogue slots): ${missingKeys.length}`);

  if (staleKeys.length > 0) {
    console.log("\n  Stale keys (first 20):");
    for (const key of staleKeys.slice(0, 20)) {
      console.log(`    - ${key}`);
    }
    if (staleKeys.length > 20) {
      console.log(`    ... and ${staleKeys.length - 20} more`);
    }
  }

  if (missingKeys.length > 0) {
    console.log("\n  Missing keys (first 20):");
    for (const key of missingKeys.slice(0, 20)) {
      console.log(`    - ${key}`);
    }
    if (missingKeys.length > 20) {
      console.log(`    ... and ${missingKeys.length - 20} more`);
    }
  }
}

async function main() {
  console.log("Querying TCGdex for Eevee / Eeveelution cards...");

  const seenIds = new Set<string>();
  const briefs: Array<{ id: string; name: string }> = [];

  for (const name of NAMES) {
    process.stdout.write(`  ${name}... `);
    const results = await tcgdex.card.list(
      Query.create().contains("name", name)
    );
    if (!results) {
      console.log("no results");
      continue;
    }
    let added = 0;
    for (const brief of results) {
      if (!seenIds.has(brief.id)) {
        seenIds.add(brief.id);
        briefs.push(brief);
        added++;
      }
    }
    console.log(`${results.length} found, ${added} new`);
  }

  const includedRefs = await loadIncludedCardRefs();
  let includedAdded = 0;
  for (const ref of includedRefs) {
    try {
      const tcgdexId = resolveIncludedToTcgdexId(ref);
      if (!seenIds.has(tcgdexId)) {
        seenIds.add(tcgdexId);
        briefs.push({
          id: tcgdexId,
          name: ref.name ?? tcgdexId,
        });
        includedAdded++;
      }
    } catch (err) {
      console.warn(`  Skipping invalid included card ref: ${(err as Error).message}`);
    }
  }
  console.log(
    `\nLoaded ${includedRefs.length} included card ref(s); ${includedAdded} new brief(s) added.`
  );

  console.log(
    `\nFetching full card data for ${briefs.length} unique cards (batches of 10)...`
  );

  const cards: PokemonCard[] = [];
  const batches = chunk(briefs, 10);

  for (let b = 0; b < batches.length; b++) {
    process.stdout.write(
      `  Batch ${b + 1}/${batches.length} (cards ${b * 10 + 1}–${Math.min((b + 1) * 10, briefs.length)})... `
    );
    const batch = batches[b];
    const fullCards = await Promise.all(
      batch.map((brief) => tcgdex.card.get(brief.id).catch(() => null))
    );

    const setIds = [...new Set(fullCards.flatMap((c) => (c ? [c.set.id] : [])))];
    await Promise.all(setIds.map(getSetMeta));

    for (const card of fullCards) {
      if (!card) continue;
      const mapped = await mapTcgdexCardToPokemon(card as Parameters<typeof mapTcgdexCardToPokemon>[0]);
      if (mapped) cards.push(mapped);
    }
    console.log("done");
  }

  const TCGDEX_IDS_SUPERSEDED_BY_MANUAL = new Set([
    "2019sm-12",
    "xya-28a", // duplicate of g1-28a (Generations Jolteon-EX 28a Yellow A alternate)
  ]);
  const cardsDeduped = cards.filter((c) => !TCGDEX_IDS_SUPERSEDED_BY_MANUAL.has(c.id));

  const manualPath = path.join(process.cwd(), "data", "manual-cards.json");
  let manualCards: PokemonCard[] = [];
  try {
    const raw = await fs.readFile(manualPath, "utf8");
    manualCards = JSON.parse(raw) as PokemonCard[];
    console.log(`\nLoaded ${manualCards.length} manual card(s) from data/manual-cards.json`);
  } catch {
    console.log("\nNo data/manual-cards.json found — skipping manual cards.");
  }

  const { cards: merged, report } = mergeCatalogueCards(cardsDeduped, manualCards);

  merged.sort((a, b) => {
    const dateA = a.set.releaseDate ?? "";
    const dateB = b.set.releaseDate ?? "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.number.localeCompare(b.number, "en", { numeric: true });
  });

  const totalVariantSlots = countVariantSlots(merged);

  const outPath = path.join(process.cwd(), "data", "cards.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf8");
  console.log(`\nSaved ${merged.length} cards to ${outPath}`);
  console.log(
    `Variant slots in catalogue: ${totalVariantSlots} (catalogue target ${getCatalogueSlotTarget(merged)})`
  );
  console.log(
    `External merge: ${report.variantsByCardId.size} cards enriched, ${report.unmatched.length} unmatched entries, ${report.duplicateSkips} duplicate skips`
  );
  if (report.unmatched.length > 0) {
    console.log("\nUnmatched external entries (first 20):");
    for (const entry of report.unmatched.slice(0, 20)) {
      console.log(
        `  - ${entry.name} · ${entry.setName} #${entry.number} · ${entry.variantLabel ?? "normal"} (${entry.sourceFile})`
      );
    }
    if (report.unmatched.length > 20) {
      console.log(`  ... and ${report.unmatched.length - 20} more`);
    }
  }

  await reportVariantMappingDrift(merged);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

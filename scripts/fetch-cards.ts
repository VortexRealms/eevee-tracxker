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

  const byId = new Map(cardsDeduped.map((c) => [c.id, c]));
  for (const mc of manualCards) {
    byId.set(mc.id, { ...mc, variants: mc.variants ?? ["normal"] });
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => {
    const dateA = a.set.releaseDate ?? "";
    const dateB = b.set.releaseDate ?? "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.number.localeCompare(b.number, "en", { numeric: true });
  });

  const outPath = path.join(process.cwd(), "data", "cards.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf8");
  console.log(`\nSaved ${merged.length} cards to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

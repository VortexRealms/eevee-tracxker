/**
 * Fetches all Eevee / Eeveelution cards from the TCGdex API and saves them to
 * data/cards.json, using Pokémon TCG API-compatible card IDs so that existing
 * collection data stored in Google Sheets is not invalidated.
 *
 * Cards not available in TCGdex (e.g. McDonald's promos) are sourced from the
 * committed data/manual-cards.json fallback file.
 *
 * Run with: npm run fetch:cards
 */

import fs from "node:fs/promises";
import path from "node:path";
import TCGdex, { Query } from "@tcgdex/sdk";
import type { PokemonCard, PokemonName } from "../types";
import { normalizeCardId } from "./set-id-map";

const tcgdex = new TCGdex("en");

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

/** Normalize TCGdex stage strings to title-cased display values. */
function normalizeStage(stage: string): string {
  return stage.replace(/^Stage(\d)$/, "Stage $1");
}

/** Build subtypes array from TCGdex card data. */
function buildSubtypes(
  stage: string | undefined,
  suffix: string | undefined
): string[] | undefined {
  const parts: string[] = [];
  if (stage) parts.push(normalizeStage(stage));
  if (suffix) parts.push(suffix);
  return parts.length > 0 ? parts : undefined;
}

/** Batch an array into chunks of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Cache for set -> { serieName, releaseDate } lookups. */
const setCache = new Map<string, { serieName: string; releaseDate: string }>();

async function getSetMeta(
  setId: string
): Promise<{ serieName: string; releaseDate: string }> {
  if (setCache.has(setId)) return setCache.get(setId)!;

  const set = await tcgdex.set.get(setId);
  const meta = {
    serieName: (set as any)?.serie?.name ?? setId,
    releaseDate: (set as any)?.releaseDate ?? "",
  };
  setCache.set(setId, meta);
  return meta;
}

async function main() {
  console.log("Querying TCGdex for Eevee / Eeveelution cards...");

  // Step 1: Collect unique card briefs across all names
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

  console.log(
    `\nFetching full card data for ${briefs.length} unique cards (batches of 10)...`
  );

  // Step 2: Fetch full card data in batches
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

    // Collect unique set IDs for this batch, then fetch set meta concurrently
    const setIds = [...new Set(fullCards.flatMap((c) => (c ? [c.set.id] : [])))];
    await Promise.all(setIds.map(getSetMeta));

    for (const card of fullCards) {
      if (!card) continue;

      const normalizedId = normalizeCardId(card.id);
      const setMeta = await getSetMeta(card.set.id);

      // releaseDate: TCGdex uses "YYYY-MM-DD"; normalise to "YYYY/MM/DD"
      const releaseDate = setMeta.releaseDate.replace(/-/g, "/");

      const images = card.image
        ? {
            small: card.image + ".low.webp",
            large: card.image + ".high.png",
          }
        : {
            // Fallback to PTCG CDN for cards without images
            small: `https://images.pokemontcg.io/${normalizedId.split("-")[0]}/${normalizedId.split("-").slice(1).join("-")}.png`,
            large: `https://images.pokemontcg.io/${normalizedId.split("-")[0]}/${normalizedId.split("-").slice(1).join("-")}_hires.png`,
          };

      cards.push({
        id: normalizedId,
        name: card.name,
        number: normalizedId.substring(normalizedId.lastIndexOf("-") + 1),
        rarity: card.rarity,
        supertype: card.category === "Pokemon" ? "Pokémon" : card.category,
        subtypes: buildSubtypes(
          (card as any).stage,
          (card as any).suffix
        ),
        types: card.types,
        hp: card.hp !== undefined && card.hp !== null ? String(card.hp) : undefined,
        set: {
          id: normalizedId.substring(0, normalizedId.lastIndexOf("-")),
          name: card.set.name,
          series: setMeta.serieName,
          releaseDate,
        },
        images,
      });
    }
    console.log("done");
  }

  // Step 3: Load manual cards (not in TCGdex) and merge
  const manualPath = path.join(process.cwd(), "data", "manual-cards.json");
  let manualCards: PokemonCard[] = [];
  try {
    const raw = await fs.readFile(manualPath, "utf8");
    manualCards = JSON.parse(raw) as PokemonCard[];
    console.log(`\nLoaded ${manualCards.length} manual card(s) from data/manual-cards.json`);
  } catch {
    console.log("\nNo data/manual-cards.json found — skipping manual cards.");
  }

  // Manual cards override TCGdex cards with the same ID
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const mc of manualCards) {
    byId.set(mc.id, mc);
  }

  const merged = Array.from(byId.values());

  // Sort by releaseDate then number
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

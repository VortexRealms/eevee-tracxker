import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard, PokemonName } from "../types";

// We use a local clone of:
// https://github.com/PokemonTCG/pokemon-tcg-data
// expected at data/pokemon-tcg-data relative to the project root.

const DATA_ROOT = path.join(process.cwd(), "data", "pokemon-tcg-data");

const NAMES: PokemonName[] = [
  "Eevee",
  "Vaporeon",
  "Jolteon",
  "Flareon",
  "Espeon",
  "Umbreon",
  "Leafeon",
  "Glaceon",
  "Sylveon"
];

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function fetchAllCardsFromLocalRepo(): Promise<PokemonCard[]> {
  // The repo structure is: sets/en.json for sets, and cards/en/{setId}.json for cards.
  type SetEntry = {
    id: string;
    name: string;
    series: string;
    releaseDate: string;
  };

  type RawCard = {
    id: string;
    name: string;
    number: string;
    rarity?: string;
    supertype: string;
    subtypes?: string[];
    types?: string[];
    hp?: string;
    images?: {
      small?: string;
      large?: string;
    };
  };

  const setsPath = path.join(DATA_ROOT, "sets", "en.json");
  const sets = await readJsonFile<SetEntry[]>(setsPath);
  const setsById = new Map(sets.map((s) => [s.id, s]));

  const allCards: PokemonCard[] = [];

  for (const set of sets) {
    let rawCards: RawCard[];
    try {
      const cardsPath = path.join(DATA_ROOT, "cards", "en", `${set.id}.json`);
      rawCards = await readJsonFile<RawCard[]>(cardsPath);
    } catch (err) {
      // Some sets might not exist as card files; skip them.
      console.warn(`Skipping set ${set.id}: ${(err as Error).message}`);
      continue;
    }

    for (const c of rawCards) {
      // Match any card whose name contains one of the base names,
      // e.g. "Eevee", "Eevee-GX", etc.
      const lowerName = c.name.toLowerCase();
      const matchesBase = NAMES.some((base) =>
        lowerName.includes(base.toLowerCase())
      );
      if (!matchesBase) continue;

      const setMeta = setsById.get(set.id);
      if (!setMeta) continue;

      allCards.push({
        id: c.id,
        name: c.name,
        number: c.number,
        rarity: c.rarity,
        supertype: c.supertype,
        subtypes: c.subtypes,
        types: c.types,
        hp: c.hp,
        set: {
          id: setMeta.id,
          name: setMeta.name,
          series: setMeta.series,
          releaseDate: setMeta.releaseDate
        },
        images: {
          small: c.images?.small ?? "",
          large: c.images?.large ?? ""
        }
      });
    }
  }

  return allCards;
}

async function main() {
  console.log(
    "Fetching Eevee / Eeveelution cards from local pokemon-tcg-data repo…"
  );
  const cards = await fetchAllCardsFromLocalRepo();

  // Sort by set release date then card number to keep things stable.
  cards.sort((a, b) => {
    const dateA = a.set.releaseDate ?? "";
    const dateB = b.set.releaseDate ?? "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.number.localeCompare(b.number, "en", { numeric: true });
  });

  const outPath = path.join(process.cwd(), "data", "cards.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(cards, null, 2), "utf8");
  console.log(`Saved ${cards.length} cards to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


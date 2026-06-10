/**
 * One-off importer: Gem Pack Vol. 2 CSV -> data/manual-cards.json entries.
 * Run with: npx tsx scripts/import-gem-pack-vol2.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";

const SET = {
  id: "cbb2c",
  name: "Gem Pack Vol. 2",
  series: "Other",
  releaseDate: "2025/05/16",
} as const;

const POKEMON_TYPES: Record<string, string> = {
  Eevee: "Colorless",
  Vaporeon: "Water",
  Jolteon: "Lightning",
  Flareon: "Fire",
  Espeon: "Psychic",
  Umbreon: "Darkness",
  Leafeon: "Grass",
  Glaceon: "Water",
  Sylveon: "Psychic",
};

const TRAINER_NAMES = new Set(["Poké Ball", "Level Ball", "Quick Ball", "Penny"]);
const ENERGY_NAMES = new Set([
  "Basic Lightning Energy",
  "Basic Psychic Energy",
  "Basic Darkness Energy",
]);

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function extractImageId(imageUrl: string): string {
  const match = imageUrl.match(/scn_cbb2\/(\d+)\.png/);
  if (!match) throw new Error(`Could not extract image id from: ${imageUrl}`);
  return match[1];
}

function buildCardMeta(name: string): Pick<PokemonCard, "supertype" | "subtypes" | "types"> {
  if (TRAINER_NAMES.has(name)) {
    return { supertype: "Trainer" };
  }
  if (ENERGY_NAMES.has(name)) {
    return { supertype: "Energy" };
  }

  const baseName = name.replace(/ VMAX$/, "").replace(/ V$/, "");
  const type = POKEMON_TYPES[baseName];
  if (!type) {
    throw new Error(`Unknown Pokémon name: ${name}`);
  }

  if (name.endsWith(" VMAX")) {
    return {
      supertype: "Pokémon",
      subtypes: ["VMAX"],
      types: [type],
    };
  }
  if (name.endsWith(" V")) {
    return {
      supertype: "Pokémon",
      subtypes: ["Basic", "V"],
      types: [type],
    };
  }
  if (name === "Eevee") {
    return {
      supertype: "Pokémon",
      subtypes: ["Basic"],
      types: [type],
    };
  }

  return {
    supertype: "Pokémon",
    types: [type],
  };
}

async function main() {
  const csvPath = path.join(process.cwd(), "gem_pack_vol_2_checklist_with_image_links.csv");
  const manualPath = path.join(process.cwd(), "data", "manual-cards.json");

  const csv = await fs.readFile(csvPath, "utf8");
  const lines = csv.trim().split(/\r?\n/).slice(1);

  const generated: PokemonCard[] = lines.map((line) => {
    const [englishName, , cardNumber, variant, , imageLink] = parseCsvLine(line);
    const imageId = extractImageId(imageLink);
    const meta = buildCardMeta(englishName);

    return {
      id: `cbb2c-${imageId}`,
      name: englishName,
      number: cardNumber,
      rarity: variant,
      ...meta,
      set: { ...SET },
      images: {
        small: imageLink,
        large: imageLink,
      },
    };
  });

  const ids = generated.map((c) => c.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new Error("Duplicate generated card IDs detected");
  }
  if (generated.length !== 140) {
    throw new Error(`Expected 140 cards, got ${generated.length}`);
  }

  const existingRaw = await fs.readFile(manualPath, "utf8");
  const existing = JSON.parse(existingRaw) as PokemonCard[];

  const existingIds = new Set(existing.map((c) => c.id));
  const conflicts = generated.filter((c) => existingIds.has(c.id));
  if (conflicts.length > 0) {
    throw new Error(
      `Generated IDs conflict with existing manual cards: ${conflicts.map((c) => c.id).join(", ")}`
    );
  }

  const merged = [...existing, ...generated];
  await fs.writeFile(manualPath, JSON.stringify(merged, null, 2) + "\n", "utf8");

  console.log(`Added ${generated.length} Gem Pack Vol. 2 cards to ${manualPath}`);
  console.log(`Total manual cards: ${merged.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

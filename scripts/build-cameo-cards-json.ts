/**
 * Build data/cameo-cards.json from the RotomAmiti cameo table (deduped physical printings).
 *
 * Run with: npm run build:cameo-cards
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonName } from "../types";

type CameoLanguage = "en" | "ja" | "zh-cn";
type CameoResolutionStatus =
  | "resolved"
  | "catalogue-existing"
  | "manual"
  | "ambiguous";

interface CameoCardEntry {
  key: string;
  cardName: string;
  setName: string;
  number: string;
  language: CameoLanguage;
  cameoOf: PokemonName[];
  notes?: string;
  catalogueId?: string;
  resolution: CameoResolutionStatus;
  ingest?: "tcgdx-included" | "manual-only";
}

interface CameoCardsFile {
  version: number;
  updatedAt: string;
  entries: CameoCardEntry[];
}

function physicalKey(
  language: string,
  setName: string,
  number: string,
  cardName: string
): string {
  return `${language}|${setName.trim().toLowerCase()}|${number.trim().toLowerCase()}|${cardName.trim().toLowerCase()}`;
}

type RawRow = {
  cameoOf: PokemonName;
  cardName: string;
  setName: string;
  number: string;
  language?: CameoLanguage;
  notes?: string;
  catalogueId?: string;
  resolution?: CameoCardEntry["resolution"];
  ingest?: CameoCardEntry["ingest"];
};

/** 84 cameo relationships from RotomAmiti's sheet (Aug 2026). */
const RAW_ROWS: RawRow[] = [
  { cameoOf: "Eevee", cardName: "Snorlax", setName: "Wizards Promos", number: "49", catalogueId: "basep-49", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Shaymin", setName: "Unleashed", number: "8", catalogueId: "hgss2-8", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Pokémon Center", setName: "BW-P Promos", number: "190", language: "ja", catalogueId: "bwp-190", resolution: "manual", ingest: "manual-only", notes: "Jumbo; 8 Eeveelution cameos share this printing" },
  { cameoOf: "Vaporeon", cardName: "Pokémon Center", setName: "BW-P Promos", number: "190", language: "ja", catalogueId: "bwp-190", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Jolteon", cardName: "Pokémon Center", setName: "BW-P Promos", number: "190", language: "ja", catalogueId: "bwp-190", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Flareon", cardName: "Pokémon Center", setName: "BW-P Promos", number: "190", language: "ja", catalogueId: "bwp-190", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Espeon", cardName: "Pokémon Center", setName: "BW-P Promos", number: "190", language: "ja", catalogueId: "bwp-190", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Umbreon", cardName: "Pokémon Center", setName: "BW-P Promos", number: "190", language: "ja", catalogueId: "bwp-190", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Leafeon", cardName: "Pokémon Center", setName: "BW-P Promos", number: "190", language: "ja", catalogueId: "bwp-190", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Glaceon", cardName: "Pokémon Center", setName: "BW-P Promos", number: "190", language: "ja", catalogueId: "bwp-190", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Eevee", cardName: "_____'s Pikachu", setName: "BW-P Promos", number: "©2012", language: "ja", catalogueId: "bwp-2012", resolution: "manual", ingest: "manual-only", notes: "Jumbo" },
  { cameoOf: "Eevee", cardName: "Sylveon-EX", setName: "Generations", number: "RC21", catalogueId: "g1-RC21", resolution: "catalogue-existing" },
  { cameoOf: "Eevee", cardName: "Sylveon-EX", setName: "Generations", number: "RC32", catalogueId: "g1-RC32", resolution: "catalogue-existing" },
  { cameoOf: "Eevee", cardName: "Sapporo's Pikachu", setName: "SM-P Promos", number: "5", language: "ja", catalogueId: "smp-jp-005", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Eevee", cardName: "Zeraora and Friends", setName: "SM-P Promos", number: "-", language: "ja", catalogueId: "smp-jp-zeraora-jumbo", resolution: "manual", ingest: "manual-only", notes: "Jumbo" },
  { cameoOf: "Eevee", cardName: "Munna", setName: "Unified Minds", number: "88", catalogueId: "sm11-88", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Champions Festival", setName: "SM Promos", number: "231", catalogueId: "smp-SM231", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Glaceon VMAX", setName: "Evolving Skies", number: "209", catalogueId: "swsh7-209", resolution: "catalogue-existing" },
  { cameoOf: "Eevee", cardName: "Sylveon VMAX", setName: "Evolving Skies", number: "212", catalogueId: "swsh7-212", resolution: "catalogue-existing" },
  { cameoOf: "Vaporeon", cardName: "Sylveon VMAX", setName: "Evolving Skies", number: "212", catalogueId: "swsh7-212", resolution: "catalogue-existing" },
  { cameoOf: "Eevee", cardName: "Paradise Resort", setName: "SV Promos", number: "224", catalogueId: "svp-224", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Poké Kid", setName: "Shining Fates", number: "70", catalogueId: "swsh45-70", resolution: "resolved", ingest: "tcgdx-included", notes: "costume" },
  { cameoOf: "Eevee", cardName: "Penny", setName: "Scarlet & Violet", number: "183", catalogueId: "sv1-183", resolution: "resolved", ingest: "tcgdx-included", notes: "backpack" },
  { cameoOf: "Eevee", cardName: "Penny", setName: "Scarlet & Violet", number: "239", catalogueId: "sv1-239", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Penny", setName: "Scarlet & Violet", number: "252", catalogueId: "sv1-252", resolution: "catalogue-existing" },
  { cameoOf: "Eevee", cardName: "Clive", setName: "Paldean Fates", number: "236", catalogueId: "sv4pt5-236", resolution: "catalogue-existing" },
  { cameoOf: "Sylveon", cardName: "Clive", setName: "Paldean Fates", number: "236", catalogueId: "sv4pt5-236", resolution: "catalogue-existing" },
  { cameoOf: "Eevee", cardName: "Penny", setName: "Paldean Fates", number: "239", catalogueId: "sv4pt5-239", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Umbreon", cardName: "Penny", setName: "Paldean Fates", number: "239", catalogueId: "sv4pt5-239", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Cassiopeia", setName: "Shrouded Fable", number: "56", catalogueId: "sv6pt5-56", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Cassiopeia", setName: "Shrouded Fable", number: "86", catalogueId: "sv6pt5-86", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Cassiopeia", setName: "Shrouded Fable", number: "94", catalogueId: "sv6pt5-94", resolution: "resolved", ingest: "tcgdx-included", notes: "phone case" },
  { cameoOf: "Sylveon", cardName: "Cassiopeia", setName: "Shrouded Fable", number: "94", catalogueId: "sv6pt5-94", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Friends in Paldea", setName: "Prismatic Evolutions", number: "109", catalogueId: "sv8pt5-109", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Friends in Paldea", setName: "Prismatic Evolutions", number: "137", catalogueId: "sv8pt5-137", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Espeon V", setName: "Evolving Skies", number: "180", catalogueId: "swsh7-180", resolution: "catalogue-existing", notes: "drawing" },
  { cameoOf: "Eevee", cardName: "Hassel", setName: "Twilight Masquerade", number: "151", catalogueId: "sv6-151", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Flareon V", setName: "SWSH Promos", number: "179", catalogueId: "swshp-SWSH179", resolution: "resolved", ingest: "tcgdx-included", notes: "picture" },
  { cameoOf: "Eevee", cardName: "Pikachu", setName: "SM-P Promos", number: "288", language: "ja", catalogueId: "smp-jp-288", resolution: "manual", ingest: "manual-only", notes: "silhouette" },
  { cameoOf: "Eevee", cardName: "Iono", setName: "Paldea Evolved", number: "269", catalogueId: "sv2-269", resolution: "resolved", ingest: "tcgdx-included", notes: "sweets" },
  { cameoOf: "Sylveon", cardName: "Iono", setName: "Paldea Evolved", number: "269", catalogueId: "sv2-269", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Morpeko", setName: "Paradox Rift", number: "206", catalogueId: "sv4-206", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Eevee", cardName: "Grookey", setName: "MEP Promos", number: "52", catalogueId: "mep-052", resolution: "manual", ingest: "manual-only", notes: "Decorative Curry" },
  { cameoOf: "Eevee", cardName: "Sprigatito", setName: "MEP Promos", number: "61", catalogueId: "mep-061", resolution: "manual", ingest: "manual-only", notes: "Vee-Vee Pick" },
  { cameoOf: "Eevee", cardName: "Floragato", setName: "Gem Pack Vol. 5", number: "22 07", language: "zh-cn", catalogueId: "cs6bc-2207", resolution: "manual", ingest: "manual-only", notes: "Vee-Vee Pick; Simplified Chinese only" },
  { cameoOf: "Vaporeon", cardName: "Flareon-EX", setName: "Generations", number: "RC28", catalogueId: "g1-RC28", resolution: "catalogue-existing" },
  { cameoOf: "Jolteon", cardName: "Flareon-EX", setName: "Generations", number: "RC28", catalogueId: "g1-RC28", resolution: "catalogue-existing" },
  { cameoOf: "Vaporeon", cardName: "Blastoise-EX", setName: "XY Promos", number: "XY122", catalogueId: "xyp-XY122", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Vaporeon", cardName: "Poncho-wearing Eevee", setName: "SM-P Promos", number: "137", language: "ja", catalogueId: "smp-jp-poncho-137", resolution: "manual", ingest: "manual-only", notes: "costume" },
  { cameoOf: "Vaporeon", cardName: "Blaine's Quiz #1", setName: "Gym Heroes", number: "97", catalogueId: "gym1-97", resolution: "resolved", ingest: "tcgdx-included", notes: "silhouette" },
  { cameoOf: "Jolteon", cardName: "Pikachu-EX", setName: "XY Promos", number: "XY124", catalogueId: "xyp-XY124", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Jolteon", cardName: "Flareon", setName: "T Promos", number: "1", language: "ja", catalogueId: "tpp-jp-1", resolution: "manual", ingest: "manual-only", notes: "only partially visible" },
  { cameoOf: "Jolteon", cardName: "Vaporeon", setName: "T Promos", number: "2", language: "ja", catalogueId: "tpp-jp-2", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Flareon", cardName: "Vaporeon", setName: "T Promos", number: "2", language: "ja", catalogueId: "tpp-jp-2", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Jolteon", cardName: "Poncho-wearing Eevee", setName: "SM-P Promos", number: "138", language: "ja", catalogueId: "smp-jp-poncho-138", resolution: "manual", ingest: "manual-only", notes: "costume" },
  { cameoOf: "Flareon", cardName: "Charizard-EX", setName: "XY Promos", number: "XY121", catalogueId: "xyp-XY121", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Flareon", cardName: "Poncho-wearing Eevee", setName: "SM-P Promos", number: "139", language: "ja", catalogueId: "smp-jp-poncho-139", resolution: "manual", ingest: "manual-only", notes: "costume" },
  { cameoOf: "Flareon", cardName: "Umbreon V", setName: "Evolving Skies", number: "189", catalogueId: "swsh7-189", resolution: "catalogue-existing", notes: "silhouette" },
  { cameoOf: "Espeon", cardName: "Drapion", setName: "BREAKpoint", number: "54", catalogueId: "xy9-54", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Espeon", cardName: "Psychic Energy", setName: "HeartGold & SoulSilver", number: "119", catalogueId: "hgss1-119", resolution: "resolved", ingest: "tcgdx-included", notes: "silhouette" },
  { cameoOf: "Espeon", cardName: "Psychic Energy", setName: "Call of Legends", number: "92", catalogueId: "col1-92", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Espeon", cardName: "Psychic Energy", setName: "2010 World Championships Decks", number: "-", catalogueId: "wcd2010-espeon", resolution: "manual", ingest: "manual-only", notes: "Unnumbered deck promo Psychic Energy" },
  { cameoOf: "Espeon", cardName: "Poncho-wearing Eevee", setName: "SM-P Promos", number: "140", language: "ja", catalogueId: "smp-jp-poncho-140", resolution: "manual", ingest: "manual-only", notes: "costume" },
  { cameoOf: "Umbreon", cardName: "Illusion's Zorua", setName: "2010 Card Design Contest", number: "Pucchigumi", language: "ja", catalogueId: "cdc2010-jp-zorua", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Umbreon", cardName: "Oracle", setName: "Skyridge", number: "138", catalogueId: "ecard3-138", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Umbreon", cardName: "All-Night Party", setName: "BREAKpoint", number: "96", catalogueId: "xy9-96", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Umbreon", cardName: "Alakazam-EX", setName: "Fates Collide", number: "125", catalogueId: "xy10-125", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Umbreon", cardName: "Karen", setName: "XY Promos", number: "XY177", catalogueId: "xyp-XY177", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Umbreon", cardName: "Darkness Energy", setName: "HeartGold & SoulSilver", number: "121", catalogueId: "hgss1-121", resolution: "resolved", ingest: "tcgdx-included", notes: "silhouette" },
  { cameoOf: "Umbreon", cardName: "Darkness Energy", setName: "Call of Legends", number: "94", catalogueId: "col1-94", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Umbreon", cardName: "Poncho-wearing Eevee", setName: "SM-P Promos", number: "141", language: "ja", catalogueId: "smp-jp-poncho-141", resolution: "manual", ingest: "manual-only", notes: "costume" },
  { cameoOf: "Leafeon", cardName: "Dawn Stadium", setName: "Majestic Dawn", number: "79", catalogueId: "dp5-79", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Glaceon", cardName: "Dawn Stadium", setName: "Majestic Dawn", number: "79", catalogueId: "dp5-79", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Leafeon", cardName: "Interviewer's Questions", setName: "Unleashed", number: "77", catalogueId: "hgss2-77", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Leafeon", cardName: "Interviewer's Questions", setName: "Call of Legends", number: "79", catalogueId: "col1-79", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Leafeon", cardName: "Poncho-wearing Eevee", setName: "SM-P Promos", number: "142", language: "ja", catalogueId: "smp-jp-poncho-142", resolution: "manual", ingest: "manual-only", notes: "costume" },
  { cameoOf: "Glaceon", cardName: "Grusha", setName: "Paldea Evolved", number: "268", catalogueId: "sv2-268", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Glaceon", cardName: "Poncho-wearing Eevee", setName: "SM-P Promos", number: "143", language: "ja", catalogueId: "smp-jp-poncho-143", resolution: "manual", ingest: "manual-only", notes: "costume" },
  { cameoOf: "Sylveon", cardName: "Pikachu", setName: "XY-P Promos", number: "90", language: "ja", catalogueId: "xyp-jp-90", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Sylveon", cardName: "Pikachu", setName: "XY Promos", number: "XY95", catalogueId: "xyp-XY95", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Sylveon", cardName: "Altaria", setName: "Generations", number: "RC24", catalogueId: "g1-RC24", resolution: "resolved", ingest: "tcgdx-included" },
  { cameoOf: "Sylveon", cardName: "Paradise Resort", setName: "MEP Promos", number: "92", catalogueId: "mep-092", resolution: "manual", ingest: "manual-only" },
  { cameoOf: "Sylveon", cardName: "Poncho-wearing Eevee", setName: "SM-P Promos", number: "144", language: "ja", catalogueId: "smp-jp-poncho-144", resolution: "manual", ingest: "manual-only", notes: "costume" },
  { cameoOf: "Sylveon", cardName: "Delcatty", setName: "Darkness Ablaze", number: "142", catalogueId: "swsh3-142", resolution: "resolved", ingest: "tcgdx-included", notes: "hairbrush" },
  { cameoOf: "Sylveon", cardName: "Jacinthe", setName: "Perfect Order", number: "122", catalogueId: "me03-122", resolution: "resolved", ingest: "tcgdx-included" },
];

function dedupeRows(rows: RawRow[]): CameoCardEntry[] {
  const byKey = new Map<string, CameoCardEntry>();

  for (const row of rows) {
    const language = row.language ?? "en";
    const key = physicalKey(language, row.setName, row.number, row.cardName);
    const existing = byKey.get(key);

    if (existing) {
      const merged = new Set([...existing.cameoOf, row.cameoOf]);
      existing.cameoOf = [...merged].sort() as PokemonName[];
      if (row.notes && !existing.notes?.includes(row.notes)) {
        existing.notes = existing.notes ? `${existing.notes}; ${row.notes}` : row.notes;
      }
      continue;
    }

    byKey.set(key, {
      key,
      cardName: row.cardName,
      setName: row.setName,
      number: row.number,
      language,
      cameoOf: [row.cameoOf],
      notes: row.notes,
      catalogueId: row.catalogueId,
      resolution: row.resolution ?? (row.catalogueId ? "resolved" : "ambiguous"),
      ingest: row.ingest,
    });
  }

  return [...byKey.values()].sort((a, b) =>
    a.catalogueId?.localeCompare(b.catalogueId ?? "") ?? a.key.localeCompare(b.key)
  );
}

async function main() {
  const entries = dedupeRows(RAW_ROWS);
  const file: CameoCardsFile = {
    version: 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    entries,
  };

  const outPath = path.join(process.cwd(), "data", "cameo-cards.json");
  await fs.writeFile(outPath, JSON.stringify(file, null, 2) + "\n", "utf8");

  console.log(`Wrote ${entries.length} unique cameo card(s) to ${outPath}`);
  console.log(`  Raw relationships: ${RAW_ROWS.length}`);
  console.log(
    `  catalogue-existing: ${entries.filter((e) => e.resolution === "catalogue-existing").length}`
  );
  console.log(`  resolved (new EN): ${entries.filter((e) => e.resolution === "resolved").length}`);
  console.log(`  manual: ${entries.filter((e) => e.resolution === "manual").length}`);
  console.log(`  ambiguous: ${entries.filter((e) => e.resolution === "ambiguous").length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

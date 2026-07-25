/**
 * Dump all Pokewallet cards for specific sets (exact set_id, eng).
 * Run: npx tsx scripts/list-pokewallet-set-cards.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFiles } from "./load-env";
import { PokewalletClient } from "./pokewallet-client";

/** Exact Pokewallet set_id values (eng). */
const TARGET_SETS: Array<{ label: string; setId: string; language?: string }> = [
  { label: "Generations", setId: "1728", language: "eng" },
  { label: "Generations: Radiant Collection", setId: "1729", language: "eng" },
  { label: "Hidden Fates: Shiny Vault", setId: "2594", language: "eng" },
  { label: "Celebrations: Classic Collection", setId: "2931", language: "eng" },
  { label: "Power Keepers", setId: "1383", language: "eng" },
];

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();
  const allSets = await client.listSets();

  const outLines: string[] = [];

  for (const target of TARGET_SETS) {
    const summary = allSets.find((s) => s.set_id === target.setId);
    const title = summary
      ? `${summary.name} (${summary.card_count} cards) | set_id=${summary.set_id} set_code=${summary.set_code ?? ""}`
      : `${target.label} | set_id=${target.setId} (not in index)`;

    outLines.push(`\n=== ${title} ===`);
    outLines.push("pkid\tname\tnumber");

    try {
      const { cards } = await client.fetchAllSetCards(
        target.setId,
        target.language
      );
      for (const c of cards.sort((a, b) =>
        String(a.card_info.card_number ?? "").localeCompare(
          String(b.card_info.card_number ?? ""),
          "en",
          { numeric: true }
        )
      )) {
        outLines.push(
          [
            c.id,
            (c.card_info.name ?? "").replace(/\t/g, " "),
            c.card_info.card_number ?? "",
          ].join("\t")
        );
      }
      outLines.push(`(${cards.length} cards listed)`);
    } catch (err) {
      outLines.push(`ERROR: ${(err as Error).message}`);
    }
  }

  const text = outLines.join("\n");
  console.log(text);

  const outPath = path.join(process.cwd(), "logs", "pokewallet-set-dumps.txt");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, text, "utf8");
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

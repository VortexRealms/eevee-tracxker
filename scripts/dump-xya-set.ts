/**
 * Dump Alternate Art Promos (Pokewallet name for TCGdex Yellow A Alternate cards).
 * Run: npx tsx scripts/dump-xya-set.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFiles } from "./load-env";
import { PokewalletClient } from "./pokewallet-client";

/** Pokewallet English "Alternate Art Promos" — Jolteon 28a/83 lives here. */
const SET_ID = "1938";

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();

  const { setMeta, cards } = await client.fetchAllSetCards(SET_ID, "eng");

  const outLines: string[] = [
    `=== ${setMeta?.name ?? SET_ID} (${cards.length} cards) | set_id=${setMeta?.set_id ?? SET_ID} set_code=${setMeta?.set_code ?? ""} ===`,
    "Note: TCGdex 'Yellow A Alternate' (xya) has no separate Pokewallet set; alt-art XY cards are in this bucket.",
    "pkid\tname\tnumber",
  ];

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

  const text = outLines.join("\n");
  console.log(text);

  const outPath = path.join(process.cwd(), "logs", "xya-set-dump.txt");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, text, "utf8");
  console.error(`\nWrote ${outPath}`);
  console.error(client.formatRateLimitStatus());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

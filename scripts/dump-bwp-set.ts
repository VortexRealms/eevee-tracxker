/**
 * Dump Black and White Promos (BW Black Star Promos) from Pokewallet.
 * Run: npx tsx scripts/dump-bwp-set.ts
 */

import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFiles } from "./load-env";
import { PokewalletClient } from "./pokewallet-client";

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();

  // Pokewallet: "Black and White Promos" | set_code=PR | set_id=1407 | 100 cards
  const { setMeta, cards } = await client.fetchAllSetCards("1407", "eng");

  const lines: string[] = [];
  lines.push(
    `=== ${setMeta?.name} (${cards.length} cards) | set_id=${setMeta?.set_id} set_code=${setMeta?.set_code ?? "PR"} ===`
  );
  lines.push("pkid\tname\tnumber");

  for (const c of cards.sort((a, b) =>
    String(a.card_info.card_number ?? "").localeCompare(
      String(b.card_info.card_number ?? ""),
      "en",
      { numeric: true }
    )
  )) {
    lines.push(
      [
        c.id,
        (c.card_info.name ?? "").replace(/\t/g, " "),
        c.card_info.card_number ?? "",
      ].join("\t")
    );
  }
  lines.push(`(${cards.length} cards listed)`);

  const text = lines.join("\n");
  console.log(text);

  const outPath = path.join(process.cwd(), "logs", "bwp-set-dump.txt");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, text, "utf8");
  console.log(`\nWrote ${outPath}`);
  console.log(client.formatRateLimitStatus());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

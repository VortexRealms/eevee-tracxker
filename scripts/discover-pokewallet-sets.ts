import { loadEnvFiles } from "./load-env";
import { PokewalletClient } from "./pokewallet-client";

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();
  const sets = await client.listSets();
  for (const q of [
    "Hidden Fates",
    "Celebrations Classic",
    "Power Keepers",
    "Generations",
  ]) {
    console.log("\n---", q, "---");
    for (const s of sets.filter(
      (x) =>
        x.name.toLowerCase().includes(q.toLowerCase()) &&
        (x.language === "eng" || !x.language)
    )) {
      console.log(s.set_id, s.set_code, s.name, s.card_count, s.language);
    }
  }
}

main().catch(console.error);

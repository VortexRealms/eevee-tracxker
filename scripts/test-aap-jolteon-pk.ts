import { loadEnvFiles } from "./load-env";
import { PokewalletClient } from "./pokewallet-client";
import { peekPrices } from "./pokewallet-price-utils";

const AAP_PK =
  "pk_2c714ea53c558734c7bfde6946c4ebb34b024582907574e32f921ce7122c6f4b7e258c15f0624ea5908f4e20072209";
const GEN_PK =
  "pk_487f5f7b9d4ea5259a6400e96aaaa22e9cdfe2fb837c76149981c5b2c426c32da18fd215da8a24185814df4b8f";

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();

  console.log("=== GET /cards/{pk} attempts for AAP pk ===");
  for (const [label, params] of [
    ["none", undefined],
    ["set_code=PR", { set_code: "PR" }],
    ["set_code=1938", { set_code: "1938" }],
    ["set_code=GEN", { set_code: "GEN" }],
  ] as const) {
    try {
      const raw = await client.request<{
        card_info?: { name?: string };
        tcgplayer?: { prices?: unknown[] };
      }>(`/cards/${encodeURIComponent(AAP_PK)}`, params);
      console.log(`  ${label}: OK — ${raw.card_info?.name}, tcg prices: ${raw.tcgplayer?.prices?.length ?? 0}`);
    } catch (err) {
      console.log(`  ${label}: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  console.log("\n=== From set_id=1938 list ===");
  const { cards } = await client.fetchAllSetCards("1938", "eng");
  const aap = cards.find((c) => c.id === AAP_PK);
  if (aap) {
    const p = peekPrices(aap);
    console.log(`  name: ${aap.card_info.name}`);
    console.log(`  derived: usd=${p.usd} eur=${p.eur}`);
    console.log(`  tcgplayer url: ${aap.tcgplayer?.url ?? "—"}`);
  }

  console.log("\n=== GET /cards/{pk} for Generations pk (g1-28) ===");
  const gen = await client.getCard(GEN_PK, "GEN");
  const gp = peekPrices(gen);
  console.log(`  name: ${gen.card_info.name}`);
  console.log(`  derived: usd=${gp.usd} eur=${gp.eur}`);
  console.log(`  tcgplayer url: ${gen.tcgplayer?.url ?? "—"}`);

  console.error("\n" + client.formatRateLimitStatus());
}

main().catch(console.error);

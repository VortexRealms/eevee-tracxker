/**
 * Dump raw Pokewallet API response for a card ID.
 * Run: npx tsx scripts/dump-pokewallet-card.ts [pk_id] [setCode?]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvFiles } from "./load-env";
import { PokewalletClient } from "./pokewallet-client";
import { peekPrices, type PokewalletIdCache } from "./pokewallet-price-utils";

const DEFAULT_PK =
  "pk_2c714ea53c558734c7bfde6946c4ebb34b024582907574e32f921ce7122c6f4b7e258c15f0624ea5908f4e20072209";

async function main() {
  await loadEnvFiles();
  const client = PokewalletClient.fromEnv();
  const pk = process.argv[2]?.trim() || DEFAULT_PK;
  const setCodeArg = process.argv[3]?.trim() ?? "PR";

  const cachePath = path.join(process.cwd(), "data", "pokewallet-id-cache.json");
  let cachedSetCode: string | undefined;
  try {
    const cache = JSON.parse(await fs.readFile(cachePath, "utf8")) as PokewalletIdCache;
    for (const entry of Object.values(cache)) {
      if (entry.pokewalletId === pk) {
        cachedSetCode = entry.setCode || undefined;
        break;
      }
    }
  } catch {
    /* optional */
  }

  const attempts: Array<{ label: string; path: string; params?: Record<string, string> }> = [
    { label: "no_set_code", path: `/cards/${encodeURIComponent(pk)}` },
    {
      label: `set_code=${setCodeArg}`,
      path: `/cards/${encodeURIComponent(pk)}`,
      params: { set_code: setCodeArg },
    },
  ];
  if (cachedSetCode && cachedSetCode !== setCodeArg) {
    attempts.push({
      label: `set_code=${cachedSetCode} (from cache)`,
      path: `/cards/${encodeURIComponent(pk)}`,
      params: { set_code: cachedSetCode },
    });
  }

  const responses: Record<string, unknown> = {};
  const out = {
    pokewalletId: pk,
    fetchedAt: new Date().toISOString(),
    responses,
  };

  for (const attempt of attempts) {
    try {
      const raw = await client.request<unknown>(attempt.path, attempt.params);
      const card =
        raw && typeof raw === "object" && "data" in (raw as object)
          ? (raw as { data: unknown }).data
          : raw;
      const cardObj = Array.isArray(card) ? card[0] : card;
      responses[attempt.label] = {
        raw,
        derivedPrices:
          cardObj && typeof cardObj === "object"
            ? peekPrices(cardObj as Parameters<typeof peekPrices>[0])
            : null,
      };
    } catch (err) {
      responses[attempt.label] = { error: (err as Error).message };
    }
  }

  // Fallback: card payload from set listing (Alternate Art Promos set_id=1938)
  try {
    const { setMeta, cards } = await client.fetchAllSetCards("1938", "eng");
    const fromSet = cards.find((c) => c.id === pk);
    responses["from_set_id_1938_list"] = {
      setMeta,
      card: fromSet ?? null,
      derivedPrices: fromSet ? peekPrices(fromSet) : null,
    };
  } catch (err) {
    responses["from_set_id_1938_list"] = { error: (err as Error).message };
  }

  const text = JSON.stringify(out, null, 2);
  console.log(text);

  const outPath = path.join(process.cwd(), "logs", "pokewallet-card-dump.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, text, "utf8");
  console.error(`\nWrote ${outPath}`);
  console.error(client.formatRateLimitStatus());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

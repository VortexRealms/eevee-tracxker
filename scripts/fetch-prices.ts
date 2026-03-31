/**
 * Fetches current market pricing for every card in data/cards.json from the
 * TCGdex REST API (which provides TCGplayer USD and Cardmarket EUR data for free)
 * and saves the result to data/prices.json.
 *
 * Pricing is stored separately from card metadata so it can be refreshed
 * independently without re-fetching all card data.
 *
 * Run with: npm run fetch:prices
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";
import { toTcgdexCardId } from "./set-id-map";

/** Canonical PTCG ids whose pricing is fetched under a different TCGdex card id. */
const PTCG_ID_TO_TCGDEX_PRICING_FETCH: Record<string, string> = {
  "mcd19-12": "2019sm-12",
};

const TCGDEX_API = "https://api.tcgdex.net/v2/en/cards";
const BATCH_SIZE = 10;
const TODAY = new Date().toISOString().slice(0, 10);

interface TcgdexPricingVariant {
  marketPrice?: number;
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
}

interface TcgdexCardPricing {
  tcgplayer?: {
    unit?: string;
    normal?: TcgdexPricingVariant;
    holofoil?: TcgdexPricingVariant;
    "reverse-holofoil"?: TcgdexPricingVariant;
    "1st-edition"?: TcgdexPricingVariant;
    "1st-edition-holofoil"?: TcgdexPricingVariant;
    unlimited?: TcgdexPricingVariant;
    "unlimited-holofoil"?: TcgdexPricingVariant;
  };
  cardmarket?: {
    unit?: string;
    avg?: number;
    low?: number;
    trend?: number;
    "avg-holo"?: number;
    "low-holo"?: number;
    "trend-holo"?: number;
    avg1?: number;
    avg7?: number;
    avg30?: number;
    "avg1-holo"?: number;
    "avg7-holo"?: number;
    "avg30-holo"?: number;
  };
}

export interface PriceEntry {
  usd?: number | null;
  eur?: number | null;
  updatedAt: string;
  variants?: Record<string, { usd?: number | null; eur?: number | null }>;
}

/** Extract per-variant USD from TCGplayer. */
function extractUsdVariants(tcgplayer: TcgdexCardPricing["tcgplayer"]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!tcgplayer) return out;
  const map: Array<[string, string]> = [
    ["normal", "normal"],
    ["reverse-holofoil", "reverse"],
    ["holofoil", "holo"],
    ["1st-edition", "firstEdition"],
    ["unlimited", "normal"],
    ["unlimited-holofoil", "holo"],
  ];
  for (const [tcgKey, variant] of map) {
    const v = (tcgplayer as Record<string, TcgdexPricingVariant | undefined>)[tcgKey];
    const price = v?.marketPrice;
    if (typeof price === "number" && !(variant in out)) out[variant] = price;
  }
  return out;
}

/** Extract per-variant EUR from Cardmarket. avg=normal, avg-holo=holo. */
function extractEurVariants(cardmarket: TcgdexCardPricing["cardmarket"]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  if (!cardmarket) return out;
  if (typeof cardmarket.avg === "number") out["normal"] = cardmarket.avg;
  if (typeof cardmarket["avg-holo"] === "number") out["holo"] = cardmarket["avg-holo"];
  return out;
}

/** Build variants object merging USD and EUR per variant. */
function buildVariants(
  tcgplayer: TcgdexCardPricing["tcgplayer"],
  cardmarket: TcgdexCardPricing["cardmarket"]
): Record<string, { usd: number | null; eur: number | null }> | undefined {
  const usdMap = extractUsdVariants(tcgplayer);
  const eurMap = extractEurVariants(cardmarket);
  const allVariants = new Set([...Object.keys(usdMap), ...Object.keys(eurMap)]);
  if (allVariants.size === 0) return undefined;
  const out: Record<string, { usd: number | null; eur: number | null }> = {};
  for (const v of allVariants) {
    const usd = usdMap[v] ?? null;
    const eur = eurMap[v] ?? null;
    if (usd !== null || eur !== null) out[v] = { usd, eur };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Best USD market price: prefer normal > reverse > holofoil variants. */
function extractUsd(tcgplayer: TcgdexCardPricing["tcgplayer"]): number | null {
  if (!tcgplayer) return null;
  const price =
    tcgplayer.normal?.marketPrice ??
    tcgplayer["reverse-holofoil"]?.marketPrice ??
    tcgplayer.holofoil?.marketPrice ??
    tcgplayer["1st-edition"]?.marketPrice ??
    tcgplayer["1st-edition-holofoil"]?.marketPrice ??
    tcgplayer.unlimited?.marketPrice ??
    tcgplayer["unlimited-holofoil"]?.marketPrice ??
    null;
  return typeof price === "number" ? price : null;
}

/** Best EUR price: prefer normal avg > holo avg, then time windows. */
function extractEur(cardmarket: TcgdexCardPricing["cardmarket"]): number | null {
  if (!cardmarket) return null;
  const price =
    cardmarket.avg ??
    cardmarket["avg-holo"] ??
    cardmarket.avg1 ??
    cardmarket["avg1-holo"] ??
    cardmarket.avg7 ??
    cardmarket["avg7-holo"] ??
    cardmarket.avg30 ??
    cardmarket["avg30-holo"] ??
    null;
  return typeof price === "number" ? price : null;
}

async function fetchPricing(tcgdexId: string): Promise<TcgdexCardPricing | null> {
  try {
    const res = await fetch(`${TCGDEX_API}/${encodeURIComponent(tcgdexId)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { pricing?: TcgdexCardPricing };
    return data.pricing ?? null;
  } catch {
    return null;
  }
}

/** Chunk an array into sub-arrays of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchEurUsdRate(): Promise<number> {
  const FALLBACK = 1.08;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD");
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as { rates?: { USD?: number } };
    const rate = data.rates?.USD;
    return typeof rate === "number" && rate > 0 ? rate : FALLBACK;
  } catch {
    console.warn("  Could not fetch EUR/USD rate, using fallback 1.08");
    return FALLBACK;
  }
}

async function main() {
  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const raw = await fs.readFile(cardsPath, "utf8");
  const cards = JSON.parse(raw) as PokemonCard[];

  console.log(`Fetching prices for ${cards.length} cards from TCGdex...`);

  const prices: Record<string, PriceEntry | { eurUsdRate: number; ratesUpdatedAt: string }> = {};
  let found = 0;
  let skipped = 0;

  const batches = chunk(cards, BATCH_SIZE);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    process.stdout.write(
      `  Batch ${b + 1}/${batches.length} (cards ${b * BATCH_SIZE + 1}–${Math.min((b + 1) * BATCH_SIZE, cards.length)})... `
    );

    const results = await Promise.all(
      batch.map(async (card) => {
        const tcgdexId =
          PTCG_ID_TO_TCGDEX_PRICING_FETCH[card.id] ?? toTcgdexCardId(card.id);
        const pricing = await fetchPricing(tcgdexId);
        return { card, pricing };
      })
    );

    for (const { card, pricing } of results) {
      if (!pricing) {
        skipped++;
        continue;
      }
      const usd = extractUsd(pricing.tcgplayer);
      const eur = extractEur(pricing.cardmarket);
      const variants = buildVariants(pricing.tcgplayer, pricing.cardmarket);
      if (usd !== null || eur !== null) {
        const entry: PriceEntry = { usd, eur, updatedAt: TODAY };
        if (variants) entry.variants = variants;
        prices[card.id] = entry;
        found++;
      } else {
        skipped++;
      }
    }
    console.log("done");
  }

  // Fetch EUR→USD rate and store as metadata so the UI can use it
  process.stdout.write("\nFetching EUR/USD exchange rate... ");
  const eurUsdRate = await fetchEurUsdRate();
  console.log(`${eurUsdRate}`);

  const output = {
    _meta: { eurUsdRate, ratesUpdatedAt: TODAY },
    ...prices,
  };

  const outPath = path.join(process.cwd(), "data", "prices.json");
  await fs.writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(
    `Saved prices for ${found} cards (${skipped} had no data) to ${outPath}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

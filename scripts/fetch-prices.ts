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
    avg1?: number;
    avg7?: number;
    avg30?: number;
  };
}

export interface PriceEntry {
  usd?: number | null;
  eur?: number | null;
  updatedAt: string;
}

/** Best USD market price: prefer holofoil > reverse > normal variants. */
function extractUsd(tcgplayer: TcgdexCardPricing["tcgplayer"]): number | null {
  if (!tcgplayer) return null;
  const price =
    tcgplayer.holofoil?.marketPrice ??
    tcgplayer["1st-edition-holofoil"]?.marketPrice ??
    tcgplayer["unlimited-holofoil"]?.marketPrice ??
    tcgplayer["reverse-holofoil"]?.marketPrice ??
    tcgplayer["1st-edition"]?.marketPrice ??
    tcgplayer.unlimited?.marketPrice ??
    tcgplayer.normal?.marketPrice ??
    null;
  return typeof price === "number" ? price : null;
}

/** Best EUR price: prefer holo average > regular average. */
function extractEur(cardmarket: TcgdexCardPricing["cardmarket"]): number | null {
  if (!cardmarket) return null;
  const price = cardmarket["avg-holo"] ?? cardmarket.avg ?? null;
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

async function main() {
  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const raw = await fs.readFile(cardsPath, "utf8");
  const cards = JSON.parse(raw) as PokemonCard[];

  console.log(`Fetching prices for ${cards.length} cards from TCGdex...`);

  const prices: Record<string, PriceEntry> = {};
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
        const tcgdexId = toTcgdexCardId(card.id);
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
      if (usd !== null || eur !== null) {
        prices[card.id] = { usd, eur, updatedAt: TODAY };
        found++;
      } else {
        skipped++;
      }
    }
    console.log("done");
  }

  const outPath = path.join(process.cwd(), "data", "prices.json");
  await fs.writeFile(outPath, JSON.stringify(prices, null, 2), "utf8");
  console.log(
    `\nSaved prices for ${found} cards (${skipped} had no data) to ${outPath}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

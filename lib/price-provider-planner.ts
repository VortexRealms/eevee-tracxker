import type { PokemonCard, VariantPriceRecord } from "../types";
import type { EbayPriceMapping } from "./ebay-price-mappings";
import { slotKey } from "./ebay-price-mappings";
import type {
  PokewalletIdCache,
  PokewalletIdCacheEntry,
  VariantFetchTarget,
} from "../scripts/pokewallet-price-utils";

export type PriceProvider = "pokewallet" | "ebay" | "manual";

export interface PokewalletResourceKey {
  pokewalletId: string;
  setCode: string;
}

export interface PokewalletVariantJob {
  cardId: string;
  catalogueVariant: string;
  resource: PokewalletResourceKey;
}

export interface EbayVariantJob {
  cardId: string;
  variant: string;
  mapping: EbayPriceMapping;
}

export interface ProviderPlan {
  pokewalletGroups: Map<string, PokewalletVariantJob[]>;
  ebayJobs: EbayVariantJob[];
}

export function pokewalletResourceKey(
  entry: { pokewalletId: string; setCode: string }
): string {
  return `${entry.pokewalletId}\0${entry.setCode ?? ""}`;
}

export function buildProviderPlan(input: {
  cards: PokemonCard[];
  cache: PokewalletIdCache;
  ebayMappings: Record<string, EbayPriceMapping>;
  manualVariants?: Set<string>;
}): ProviderPlan {
  const pokewalletGroups = new Map<string, PokewalletVariantJob[]>();
  const ebayJobs: EbayVariantJob[] = [];

  for (const card of input.cards) {
    const cached = input.cache[card.id];
    const variants = card.variants?.length ? card.variants : ["normal"];
    let defaultResourceAdded = false;

    for (const variant of variants) {
      const key = slotKey(card.id, variant);
      if (input.manualVariants?.has(key)) continue;

      const ebayMapping = input.ebayMappings[key];
      if (ebayMapping) {
        ebayJobs.push({ cardId: card.id, variant, mapping: ebayMapping });
        continue;
      }

      if (!cached) continue;
      const targets = resolvePokewalletTargetsForVariant(
        cached,
        variant,
        defaultResourceAdded
      );
      for (const target of targets) {
        if (target.catalogueVariant === "__default__") {
          defaultResourceAdded = true;
        }
        const resource = {
          pokewalletId: target.entry.pokewalletId,
          setCode: target.entry.setCode ?? "",
        };
        const groupKey = pokewalletResourceKey(resource);
        const jobs = pokewalletGroups.get(groupKey) ?? [];
        jobs.push({
          cardId: card.id,
          catalogueVariant: target.catalogueVariant,
          resource,
        });
        pokewalletGroups.set(groupKey, jobs);
      }
    }
  }

  return { pokewalletGroups, ebayJobs };
}

function resolvePokewalletTargetsForVariant(
  cacheEntry: PokewalletIdCacheEntry,
  variant: string,
  defaultResourceAdded: boolean
): VariantFetchTarget[] {
  if (cacheEntry.variants?.[variant]) {
    return [
      {
        catalogueVariant: variant,
        entry: cacheEntry.variants[variant],
      },
    ];
  }

  if (defaultResourceAdded || !cacheEntry.pokewalletId) {
    return [];
  }

  return [
    {
      catalogueVariant: "__default__",
      entry: {
        pokewalletId: cacheEntry.pokewalletId,
        setCode: cacheEntry.setCode,
        resolvedAt: cacheEntry.resolvedAt,
        matchScore: cacheEntry.matchScore,
        searchQuery: cacheEntry.searchQuery,
      },
    },
  ];
}

export function applyVariantRecordToEntry(
  entries: Record<string, import("../types").PriceEntry>,
  cardId: string,
  variant: string,
  record: VariantPriceRecord,
  updatedAt: string
): void {
  const existing = entries[cardId] ?? {
    usd: null,
    eur: null,
    updatedAt,
  };
  const variants = { ...(existing.variants ?? {}), [variant]: record };
  entries[cardId] = {
    ...existing,
    updatedAt,
    variants,
    usd: existing.usd,
    eur: existing.eur,
  };
}

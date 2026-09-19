/**
 * Shared catalogue merge: manual cards → external variants → manual field pass → master-set finalize.
 */

import type { PokemonCard } from "../types";
import {
  applyExternalVariantsToCards,
  buildExternalVariantsByCardId,
  finalizeMasterSetCatalog,
} from "./external-variant-catalog";
import { applyCameoMetadata } from "./cameo-catalogue";
import { mergeVariantLists } from "./merge-variants";
import { CATALOGUE_VARIANT_OVERRIDES } from "./variant-catalogue-fixes";

/** Additional overrides kept here for discoverability (see variant-catalogue-fixes.ts). */
const LOCAL_CATALOGUE_VARIANT_OVERRIDES: Record<string, string[]> = {
  // Wizards promo #11 is holofoil-only plus the Jr Stamp Rally printing.
  "basep-11": ["holo", "wPromo"],
  // SWSH195 is a holo promo; TCGdex also emits a spurious "normal" slot with no price.
  "swshp-SWSH195": ["holo", "playPokemon", "jumbo"],
  // SWSH197 is the same pattern as SWSH195 (holo promo + Prize Pack + jumbo).
  "swshp-SWSH197": ["holo", "playPokemon", "jumbo"],
  // SIR trainer; Pokewallet TCGPlayer sub_type is Holofoil only.
  "sv1-252": ["holo"],
  // BREAKpoint Rare; TCGdex omits reverse but Pokewallet lists Reverse Holofoil.
  "xy9-54": ["normal", "reverse"],
  // 30th Celebration is foil-in-pack; Pokewallet lists Holofoil. TCGdex currently flags
  // every card as "normal" only. 116 is regular holofoil plus cosmos holofoil.
  "30c-69": ["holo"],
  "30c-70": ["holo"],
  "30c-71": ["holo"],
  "30c-91": ["holo"],
  "30c-92": ["holo"],
  "30c-116": ["holo", "cosmos"],
  "30c-117": ["holo"],
  "30c-118": ["holo"],
  "30c-148": ["holo"],
  "30c-149": ["holo"],
  "30c-150": ["holo"],
  "30c-153": ["holo"],
};

const MERGED_CATALOGUE_VARIANT_OVERRIDES: Record<string, string[]> = {
  ...LOCAL_CATALOGUE_VARIANT_OVERRIDES,
  ...CATALOGUE_VARIANT_OVERRIDES,
};

function applyCatalogueVariantOverrides(cards: PokemonCard[]): PokemonCard[] {
  return cards.map((card) => {
    const override = MERGED_CATALOGUE_VARIANT_OVERRIDES[card.id];
    if (!override) return card;
    return { ...card, variants: override };
  });
}

export function mergeCatalogueCards(
  baseCards: PokemonCard[],
  manualCards: PokemonCard[] = []
): { cards: PokemonCard[]; report: ReturnType<typeof buildExternalVariantsByCardId> } {
  const byId = new Map(baseCards.map((c) => [c.id, c]));

  for (const mc of manualCards) {
    const existing = byId.get(mc.id);
    byId.set(mc.id, {
      ...mc,
      variants:
        mc.variants != null
          ? mergeVariantLists(existing?.variants, mc.variants)
          : (existing?.variants ?? ["normal"]),
    });
  }

  const { cards: withExternal } = applyExternalVariantsToCards(Array.from(byId.values()));

  byId.clear();
  for (const card of withExternal) {
    byId.set(card.id, card);
  }

  for (const mc of manualCards) {
    const existing = byId.get(mc.id);
    byId.set(mc.id, {
      ...mc,
      variants:
        mc.variants != null
          ? mergeVariantLists(existing?.variants, mc.variants)
          : (existing?.variants ?? ["normal"]),
    });
  }

  const merged = applyCatalogueVariantOverrides(Array.from(byId.values()));
  const report = buildExternalVariantsByCardId(merged);
  const manualCatalogueIds = new Set(manualCards.map((c) => c.id));
  return {
    cards: applyCameoMetadata(
      finalizeMasterSetCatalog(merged, report, manualCatalogueIds)
    ),
    report,
  };
}

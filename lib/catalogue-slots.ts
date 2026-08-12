import type { PokemonCard } from "../types";
import { variantSortIndex } from "./variant-labels";

export interface VariantSlot {
  card: PokemonCard;
  variant: string;
  slotKey: string;
}

export function buildCatalogueSlots(cards: PokemonCard[]): VariantSlot[] {
  const slots: VariantSlot[] = [];

  for (const card of cards) {
    const variants = card.variants?.length ? card.variants : [];
    for (const variant of variants) {
      slots.push({
        card,
        variant,
        slotKey: `${card.id}:${variant}`,
      });
    }
  }

  return slots;
}

export function isSlotOwned(slotKey: string, ownedKeys: Set<string>): boolean {
  return ownedKeys.has(slotKey);
}

export function sortVariantSlots(slots: VariantSlot[], cards: PokemonCard[]): VariantSlot[] {
  const cardIndexMap = new Map(cards.map((c, i) => [c.id, i]));
  return [...slots].sort((a, b) => {
    const idxA = cardIndexMap.get(a.card.id) ?? 9999;
    const idxB = cardIndexMap.get(b.card.id) ?? 9999;
    if (idxA !== idxB) return idxA - idxB;
    return variantSortIndex(a.variant) - variantSortIndex(b.variant);
  });
}

export function buildSortedCatalogueSlots(cards: PokemonCard[]): VariantSlot[] {
  return sortVariantSlots(buildCatalogueSlots(cards), cards);
}

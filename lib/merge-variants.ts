import { variantSortIndex } from "./variant-labels";

/** Union variant keys preserving catalogue sort order; drops empty/falsy. */
export function mergeVariantLists(...lists: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const list of lists) {
    if (!list) continue;
    for (const variant of list) {
      const key = variant?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(key);
    }
  }

  return merged.sort((a, b) => {
    const diff = variantSortIndex(a) - variantSortIndex(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
}

export function countVariantSlots(cards: Array<{ variants?: string[] }>): number {
  return cards.reduce((sum, card) => sum + (card.variants?.length ?? 0), 0);
}

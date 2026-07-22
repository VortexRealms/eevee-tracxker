export const VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  reverse: "Reverse Holofoil",
  holo: "Holofoil",
  pokeball: "Poké Ball",
  masterball: "Master Ball",
  firstEdition: "1st Edition",
  wPromo: "W Promo",
};

export const VARIANT_SORT_ORDER = [
  "normal",
  "reverse",
  "holo",
  "pokeball",
  "masterball",
  "firstEdition",
  "wPromo",
] as const;

export function getVariantLabel(variant: string): string {
  return VARIANT_LABELS[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1);
}

export function variantSortIndex(variant: string): number {
  const idx = VARIANT_SORT_ORDER.indexOf(variant as (typeof VARIANT_SORT_ORDER)[number]);
  return idx >= 0 ? idx : 999;
}

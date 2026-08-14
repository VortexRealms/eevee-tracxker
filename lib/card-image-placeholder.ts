/** Standard Pokémon card back used when no card artwork is available. */
export const CARD_BACK_IMAGE = {
  small: "https://images.scrydex.com/pokemon/back/medium",
  large: "https://images.scrydex.com/pokemon/back/medium",
} as const;

export function cardBackImages(): { small: string; large: string } {
  return { ...CARD_BACK_IMAGE };
}

export function isCardBackImageUrl(url: string | undefined): boolean {
  if (!url) return true;
  return url === CARD_BACK_IMAGE.small || url === CARD_BACK_IMAGE.large;
}

/** True when manual/card entry has artwork other than the generic card-back placeholder. */
export function hasCustomCardImages(
  images: { small?: string; large?: string } | undefined
): boolean {
  if (!images) return false;
  return !isCardBackImageUrl(images.small) || !isCardBackImageUrl(images.large);
}

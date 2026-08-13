/** Standard Pokémon card back used when no card artwork is available. */
export const CARD_BACK_IMAGE = {
  small: "https://images.scrydex.com/pokemon/back/medium",
  large: "https://images.scrydex.com/pokemon/back/medium",
} as const;

export function cardBackImages(): { small: string; large: string } {
  return { ...CARD_BACK_IMAGE };
}

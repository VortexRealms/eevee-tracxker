/** Non-Eeveelution cards tracked in the master set (not in *External.json). */
export const MASTER_SET_EXTRA_CARD_IDS = new Set([
  "sm11-188",
  "sm11-231",
  "sv1-252",
  "sv4pt5-236",
  "cbb2c-1004",
]);

export function isMasterSetCatalogueCard(
  cardId: string,
  externalVariantCardIds: ReadonlySet<string>
): boolean {
  return externalVariantCardIds.has(cardId) || MASTER_SET_EXTRA_CARD_IDS.has(cardId);
}

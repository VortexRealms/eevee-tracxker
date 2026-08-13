/** Non-Eeveelution cards tracked in the master set (not in *External.json). */
export const MASTER_SET_EXTRA_CARD_IDS = new Set([
  "sm11-188",
  "sm11-231",
  "sv1-252",
  "sv4pt5-236",
  "cbb2c-1004",
]);

let cachedCameoMasterSetIds: Set<string> | null = null;

function loadCameoMasterSetIds(): Set<string> {
  if (cachedCameoMasterSetIds) return cachedCameoMasterSetIds;
  try {
    // Lazy require avoids circular imports during one-off scripts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cameoMasterSetIds } = require("./cameo-catalogue") as {
      cameoMasterSetIds: () => Set<string>;
    };
    cachedCameoMasterSetIds = cameoMasterSetIds();
  } catch {
    cachedCameoMasterSetIds = new Set();
  }
  return cachedCameoMasterSetIds;
}

export function isMasterSetCatalogueCard(
  cardId: string,
  externalVariantCardIds: ReadonlySet<string>
): boolean {
  return (
    externalVariantCardIds.has(cardId) ||
    MASTER_SET_EXTRA_CARD_IDS.has(cardId) ||
    loadCameoMasterSetIds().has(cardId)
  );
}

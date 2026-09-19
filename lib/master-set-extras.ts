/** Cards tracked in the master set that are not in *External.json (cameos, extras, new sets). */
export const MASTER_SET_EXTRA_CARD_IDS = new Set([
  "sm11-188",
  "sm11-231",
  "sv1-252",
  "sv4pt5-236",
  "cbb2c-1004",
  // 30th Celebration Eeveelutions — not in Set Hunter yet; cameos 148–150 are via cameo-cards.json.
  "30c-69",
  "30c-70",
  "30c-71",
  "30c-91",
  "30c-92",
  "30c-116",
  "30c-117",
  "30c-118",
  "30c-153",
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

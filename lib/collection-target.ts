import { getAllCards } from "./cards";
import { countVariantSlots } from "./merge-variants";
import type { PokemonCard } from "../types";

/**
 * Total variant slots in the committed catalogue (derived from cards.json).
 * Includes Set Hunter external slots, manual extras, and manual-only sets such as CBB2C.
 */
export function getCatalogueSlotTarget(cards?: PokemonCard[]): number {
  return countVariantSlots(cards ?? getAllCards());
}

/** Snapshot at module load for static marketing copy; prefer getCatalogueSlotTarget(cards) in UI. */
export const MASTER_SET_TARGET = getCatalogueSlotTarget();

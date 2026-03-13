/**
 * Bidirectional ID mapping between TCGdex set IDs and Pokémon TCG API set IDs.
 *
 * TCGdex uses:
 *   - Zero-padded SV set numbers: sv01, sv03.5, sv08.5
 *   - Dot notation for sub-sets: sv03.5, swsh12.5
 *   - Merged TG/GG cards into parent set: swsh9, swsh12.5
 *   - pgo is swsh10.5, fut20 is fut2020
 *
 * Pokémon TCG API uses:
 *   - Unpadded SV numbers: sv1, sv3pt5, sv8pt5
 *   - "pt" notation for sub-sets: sv3pt5, swsh12pt5
 *   - Separate sets for TG/GG: swsh9tg, swsh12pt5gg
 */

export const TCGDEX_TO_PTCG_SET: Record<string, string> = {
  // Scarlet & Violet
  sv01: "sv1",
  sv02: "sv2",
  sv03: "sv3",
  "sv03.5": "sv3pt5",
  sv04: "sv4",
  "sv04.5": "sv4pt5",
  sv05: "sv5",
  sv06: "sv6",
  "sv06.5": "sv6pt5",
  sv07: "sv7",
  sv08: "sv8",
  "sv08.5": "sv8pt5",
  sv09: "sv9",
  sv10: "sv10",
  "sv10.5w": "sv10pt5",
  "sv10.5b": "sv10pt5b",
  // Sword & Shield variants
  "swsh4.5": "swsh45",
  "swsh10.5": "pgo",
  "swsh12.5": "swsh12pt5",
  // Other
  fut2020: "fut20",
  // cel25 -> cel25 for regular cards; Classic Collection handled specially in normalizeCardId
};

/** TCGdex set IDs where numeric localIds are zero-padded to 3 digits. */
const PADDED_SETS = new Set([
  "sv01", "sv02", "sv03", "sv03.5",
  "sv04", "sv04.5", "sv05", "sv06", "sv06.5",
  "sv07", "sv08", "sv08.5", "sv09", "sv10",
  "sv10.5w", "sv10.5b",
  "svp",
  "swsh10.5", "swsh12.5",
]);

/**
 * Convert a TCGdex card ID to the Pokémon TCG API format used in cards.json.
 * Examples:
 *   sv06.5-050  -> sv6pt5-50
 *   sv08.5-161  -> sv8pt5-161
 *   swsh12.5-013 -> swsh12pt5-13
 *   swsh12.5-GG35 -> swsh12pt5gg-GG35
 *   swsh9-TG22  -> swsh9tg-TG22
 *   cel25-17A   -> cel25c-17_A
 *   base2-3     -> base2-3   (unchanged)
 *   fut2020-2   -> fut20-2
 */
export function normalizeCardId(tcgdexId: string): string {
  const lastDash = tcgdexId.lastIndexOf("-");
  const setId = tcgdexId.substring(0, lastDash);
  let localId = tcgdexId.substring(lastDash + 1);

  let ptcgSetId = TCGDEX_TO_PTCG_SET[setId] ?? setId;

  // swsh12.5 GG-prefixed cards -> swsh12pt5gg
  if (setId === "swsh12.5" && /^GG/i.test(localId)) {
    ptcgSetId = "swsh12pt5gg";
  }

  // swsh9 TG-prefixed cards -> swsh9tg
  if (setId === "swsh9" && /^TG/i.test(localId)) {
    ptcgSetId = "swsh9tg";
  }

  // cel25 Classic Collection cards (e.g. 17A) -> cel25c with underscore (17_A)
  if (setId === "cel25" && /^\d+[A-Z]$/.test(localId)) {
    const m = localId.match(/^(\d+)([A-Z])$/);
    if (m) {
      localId = `${m[1]}_${m[2]}`;
      ptcgSetId = "cel25c";
    }
  }

  // Strip leading zeros from purely numeric localIds (e.g. "050" -> "50")
  if (/^\d+$/.test(localId)) {
    localId = String(parseInt(localId, 10));
  }

  return `${ptcgSetId}-${localId}`;
}

/**
 * Convert a Pokémon TCG API card ID back to the TCGdex format.
 * Used by fetch-prices to look up pricing for cards already in cards.json.
 */
export const PTCG_TO_TCGDEX_SET: Record<string, string> = {
  sv1: "sv01", sv2: "sv02", sv3: "sv03", sv3pt5: "sv03.5",
  sv4: "sv04", sv4pt5: "sv04.5", sv5: "sv05", sv6: "sv06",
  sv6pt5: "sv06.5", sv7: "sv07", sv8: "sv08", sv8pt5: "sv08.5",
  sv9: "sv09", sv10: "sv10", sv10pt5: "sv10.5w", sv10pt5b: "sv10.5b",
  swsh45: "swsh4.5", pgo: "swsh10.5",
  swsh12pt5: "swsh12.5", swsh12pt5gg: "swsh12.5",
  swsh9tg: "swsh9",
  cel25c: "cel25",
  fut20: "fut2020",
};

export function toTcgdexCardId(ptcgId: string): string {
  const lastDash = ptcgId.lastIndexOf("-");
  const ptcgSetId = ptcgId.substring(0, lastDash);
  let localId = ptcgId.substring(lastDash + 1);

  const tcgdexSetId = PTCG_TO_TCGDEX_SET[ptcgSetId] ?? ptcgSetId;

  // cel25c-17_A -> cel25-17A
  if (ptcgSetId === "cel25c" && localId.includes("_")) {
    localId = localId.replace("_", "");
  }

  // Pad numeric IDs to 3 digits for sets that require it
  if (PADDED_SETS.has(tcgdexSetId) && /^\d+$/.test(localId)) {
    localId = localId.padStart(3, "0");
  }

  return `${tcgdexSetId}-${localId}`;
}

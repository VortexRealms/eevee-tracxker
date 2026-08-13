/**
 * Curated mapping from our cards.json set.id to Pokewallet set identifiers.
 * Used before fuzzy name matching when auto-resolution is unreliable.
 */

export interface SetLookupHint {
  /** Pokewallet set_code or numeric set_id */
  pokewalletSetCode: string;
  /** Optional language filter for ambiguous set codes */
  language?: string;
}

/** Our set.id -> Pokewallet set code or numeric set_id */
export const OUR_SET_TO_POKEWALLET: Record<string, SetLookupHint> = {
  cbb2c: { pokewalletSetCode: "CBB2C" },
  cs6bc: { pokewalletSetCode: "CBB5C", language: "chn" },
  mep: { pokewalletSetCode: "MEP", language: "eng" },
  smp: { pokewalletSetCode: "SMP", language: "eng" },
  svp: { pokewalletSetCode: "SVP", language: "eng" },
  basep: { pokewalletSetCode: "BASEP", language: "eng" },
  swsh45: { pokewalletSetCode: "swsh45", language: "eng" },
  swshp: { pokewalletSetCode: "swshp", language: "eng" },
  xyp: { pokewalletSetCode: "xyp", language: "eng" },
  swsh12pt5gg: { pokewalletSetCode: "swsh12.5gg", language: "eng" },
  swsh9tg: { pokewalletSetCode: "swsh9.5tg", language: "eng" },
  swsh12pt5: { pokewalletSetCode: "CZ", language: "eng" },
  mcd19: { pokewalletSetCode: "2019SM" },
  mcd24: { pokewalletSetCode: "MCD24" },
  base2: { pokewalletSetCode: "JU", language: "eng" },
};

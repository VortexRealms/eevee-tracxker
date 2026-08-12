export const VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  reverse: "Reverse Holofoil",
  holo: "Holofoil",
  pokeball: "Poké Ball",
  masterball: "Master Ball",
  firstEdition: "1st Edition",
  wPromo: "W Promo",
  trickOrTrade: "Trick or Trade",
};

/** Set Hunter / external JSON label → internal variant key */
export const EXTERNAL_VARIANT_MAP: Record<string, string> = {
  Normal: "normal",
  Unlimited: "normal",
  Holo: "holo",
  "Reverse Holo": "reverse",
  "1st Edition": "firstEdition",
  "Poké Ball": "pokeball",
  "Poke Ball": "pokeball",
  "Master Ball": "masterball",
  "Jr Stamp Rally": "wPromo",
  "W Promo": "wPromo",
  Cosmos: "cosmos",
  Jumbo: "jumbo",
  "Cracked Ice": "crackedIce",
  "Play Pokemon": "playPokemon",
  "Play Pokémon": "playPokemon",
  "Pokemon Day": "pokemonDay",
  Expansion: "expansion",
  "Expansion Staff": "expansionStaff",
  Staff: "staff",
  League: "league",
  GameStop: "gameStop",
  "EB Games": "ebGames",
  "Pokémon Center": "pokemonCenter",
  "Pokemon Center": "pokemonCenter",
  "Trick or Trade": "trickOrTrade",
  Sequin: "sequin",
  Snowflake: "snowflake",
  "Burger King": "burgerKing",
  Eevee: "eeveeStamp",
  Mewtwo: "mewtwoStamp",
  "Build Abear": "buildABear",
  "Pokemon Together": "pokemonTogether",
  "Pokemon Gym": "pokemonGym",
  Halloween: "trickOrTrade",
};

export const VARIANT_SORT_ORDER = [
  "normal",
  "reverse",
  "holo",
  "pokeball",
  "masterball",
  "firstEdition",
  "wPromo",
  "cosmos",
  "crackedIce",
  "playPokemon",
  "pokemonDay",
  "expansion",
  "expansionStaff",
  "staff",
  "league",
  "gameStop",
  "ebGames",
  "pokemonCenter",
  "trickOrTrade",
  "sequin",
  "snowflake",
  "burgerKing",
  "eeveeStamp",
  "mewtwoStamp",
  "buildABear",
  "pokemonTogether",
  "pokemonGym",
  "jumbo",
] as const;

function slugifyExternalVariant(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

export type ExternalVariantClassification = {
  key: string;
  kind: "explicit" | "ambiguous";
};

const AMBIGUOUS_EXTERNAL_LABELS = new Set(["Unlimited"]);

export function externalVariantToKey(label: string | null | undefined): string {
  if (!label?.trim()) return "normal";

  const trimmed = label.trim();
  const mapped = EXTERNAL_VARIANT_MAP[trimmed];
  if (mapped) return mapped;

  const slug = slugifyExternalVariant(trimmed);
  return slug || "normal";
}

/** Classify external labels: explicit variants are merged in; Unlimited/null are aliases only when no originals exist. */
export function classifyExternalVariantLabel(
  label: string | null | undefined
): ExternalVariantClassification {
  if (!label?.trim()) {
    return { key: "normal", kind: "ambiguous" };
  }

  const trimmed = label.trim();
  if (AMBIGUOUS_EXTERNAL_LABELS.has(trimmed)) {
    return { key: "normal", kind: "ambiguous" };
  }

  return { key: externalVariantToKey(trimmed), kind: "explicit" };
}

export function registerExternalVariantLabel(
  variantKey: string,
  sourceLabel: string | null | undefined
): void {
  if (!sourceLabel?.trim()) return;
  if (!VARIANT_LABELS[variantKey]) {
    VARIANT_LABELS[variantKey] = sourceLabel.trim();
  }
}

export function getVariantLabel(variant: string): string {
  return VARIANT_LABELS[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1);
}

export function variantSortIndex(variant: string): number {
  const idx = VARIANT_SORT_ORDER.indexOf(variant as (typeof VARIANT_SORT_ORDER)[number]);
  return idx >= 0 ? idx : 999;
}

export type PokemonName =
  | "Eevee"
  | "Vaporeon"
  | "Jolteon"
  | "Flareon"
  | "Espeon"
  | "Umbreon"
  | "Leafeon"
  | "Glaceon"
  | "Sylveon";

export interface PokemonCardSet {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
}

export interface PokemonCardImages {
  small: string;
  large: string;
}

export interface CardPricing {
  usd?: number | null;
  eur?: number | null;
  updatedAt?: string;
}

export type PriceSource = "pokewallet" | "ebay" | "manual";
export type PriceKind = "market" | "active_listing_median" | "manual";

export interface VariantPriceRecord {
  usd?: number | null;
  eur?: number | null;
  updatedAt?: string;
  source?: PriceSource;
  priceKind?: PriceKind;
  sampleCount?: number;
  metadata?: Record<string, unknown>;
}

export interface PriceEntry {
  usd?: number | null;
  eur?: number | null;
  updatedAt: string;
  source?: PriceSource;
  variants?: Record<string, VariantPriceRecord>;
}

export interface PriceRow {
  cardId: string;
  variant?: string;
  usd?: number | null;
  eur?: number | null;
  updatedAt?: string;
  source?: PriceSource;
  priceKind?: PriceKind;
  sampleCount?: number | null;
  metadataJson?: string;
  /** Legacy Google Sheet column — card-level variants JSON blob. */
  variantsJson?: string;
}

export type DisplayCurrency = "USD" | "EUR" | "HUF" | "GBP";

export interface PricesMeta {
  ratesUpdatedAt: string;
  /** 1 USD = X units of each currency (Frankfurter / Sheet meta row). */
  usdRates?: Partial<Record<Exclude<DisplayCurrency, "USD">, number>>;
}

export interface PricesSnapshot {
  meta: PricesMeta;
  entries: Record<string, PriceEntry>;
}

export interface PokemonCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  supertype: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  set: PokemonCardSet;
  images: PokemonCardImages;
  pricing?: CardPricing;
  variants?: string[];
  /** Eeveelution(s) featured as a cameo on this card (non-Eeveelution printings). */
  cameoOf?: PokemonName[];
  /** Catalogue language for regional-only printings (Pokewallet disambiguation). */
  catalogueLanguage?: "en" | "ja" | "zh-cn";
}

export interface CollectionRow {
  cardId: string;
  variant?: string;
  name: string;
  setName: string;
  number: string;
  imageUrl: string;
  owned: boolean;
}

export interface MergedCard extends PokemonCard {
  collection: CollectionRow | null;
}


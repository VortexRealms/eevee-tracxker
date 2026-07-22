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

export interface PriceEntry {
  usd?: number | null;
  eur?: number | null;
  updatedAt: string;
  source?: "pokewallet" | "manual";
  variants?: Record<string, { usd?: number | null; eur?: number | null }>;
}

export interface PriceRow {
  cardId: string;
  usd?: number | null;
  eur?: number | null;
  updatedAt?: string;
  variantsJson?: string;
  source?: "pokewallet" | "manual";
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


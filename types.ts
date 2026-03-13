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
}

export interface CollectionRow {
  cardId: string;
  name: string;
  setName: string;
  number: string;
  imageUrl: string;
  owned: boolean;
}

export interface MergedCard extends PokemonCard {
  collection: CollectionRow | null;
}


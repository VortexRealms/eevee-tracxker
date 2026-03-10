import cardsData from "../data/cards.json";
import type { CollectionRow, MergedCard, PokemonCard } from "../types";

export function getAllCards(): PokemonCard[] {
  // cards.json is treated as a static snapshot bundled with the app.
  return cardsData as PokemonCard[];
}

export function mergeCardsWithCollection(
  cards: PokemonCard[],
  collection: CollectionRow[]
): MergedCard[] {
  const byId = new Map(collection.map((row) => [row.cardId, row]));
  return cards.map((card) => ({
    ...card,
    collection: byId.get(card.id) ?? null
  }));
}


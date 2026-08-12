import assert from "node:assert/strict";
import type { PokemonCard } from "../types";
import {
  buildCatalogueSlots,
  buildSortedCatalogueSlots,
  isSlotOwned,
} from "../lib/catalogue-slots";
import { getCatalogueSlotTarget } from "../lib/collection-target";

const sampleCards: PokemonCard[] = [
  {
    id: "base1-1",
    name: "Eevee",
    number: "51",
    supertype: "Pokémon",
    set: {
      id: "base1",
      name: "Base",
      series: "Base",
      releaseDate: "1999/01/09",
    },
    images: { small: "https://example.com/s.webp", large: "https://example.com/l.png" },
    variants: ["normal", "holo"],
  },
  {
    id: "base2-3",
    name: "Flareon",
    number: "3",
    supertype: "Pokémon",
    set: {
      id: "base2",
      name: "Jungle",
      series: "Base",
      releaseDate: "1999/06/16",
    },
    images: { small: "https://example.com/s2.webp", large: "https://example.com/l2.png" },
    variants: [],
  },
];

{
  const slots = buildCatalogueSlots(sampleCards);
  assert.equal(slots.length, 2);
  assert.equal(slots[0].slotKey, "base1-1:normal");
  assert.equal(slots[1].slotKey, "base1-1:holo");
}

{
  const restoredJungleRare = buildCatalogueSlots([
    {
      ...sampleCards[1],
      variants: ["holo", "firstEdition"],
    },
  ]);
  assert.equal(restoredJungleRare.length, 2);
  assert.equal(restoredJungleRare[0].slotKey, "base2-3:holo");
  assert.equal(restoredJungleRare[1].slotKey, "base2-3:firstEdition");
}

{
  const restoredJungleCommon = buildCatalogueSlots([
    {
      ...sampleCards[1],
      id: "base2-19",
      number: "19",
      variants: ["normal", "firstEdition"],
    },
  ]);
  assert.equal(restoredJungleCommon[0].slotKey, "base2-19:normal");
  assert.equal(restoredJungleCommon[1].slotKey, "base2-19:firstEdition");
}

{
  const sorted = buildSortedCatalogueSlots(sampleCards);
  assert.equal(sorted[0].variant, "normal");
  assert.equal(sorted[1].variant, "holo");
}

{
  const owned = new Set(["base1-1:holo"]);
  assert.equal(isSlotOwned("base1-1:holo", owned), true);
  assert.equal(isSlotOwned("base1-1:normal", owned), false);
}

{
  const manualCards: PokemonCard[] = [
    {
      id: "cbb2c-1001",
      name: "Manual",
      number: "1",
      supertype: "Pokémon",
      set: {
        id: "cbb2c",
        name: "Gem Pack Vol. 2",
        series: "Chinese",
        releaseDate: "2024/01/01",
      },
      images: { small: "https://example.com/s.webp", large: "https://example.com/l.png" },
      variants: ["normal"],
    },
    {
      id: "cbb2c-1002",
      name: "Manual Two",
      number: "2",
      supertype: "Pokémon",
      set: {
        id: "cbb2c",
        name: "Gem Pack Vol. 2",
        series: "Chinese",
        releaseDate: "2024/01/01",
      },
      images: { small: "https://example.com/s2.webp", large: "https://example.com/l2.png" },
      variants: ["holo"],
    },
  ];
  const slots = buildCatalogueSlots(manualCards);
  assert.equal(slots.length, 2);
  assert.equal(getCatalogueSlotTarget(manualCards), 2);
}

console.log("test-catalogue-slots: ok");

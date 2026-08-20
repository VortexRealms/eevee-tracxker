/**
 * Collection grid Eeveelution / set / cameo filter matchers.
 *
 * Run with: npm run test:collection-filters
 */

import assert from "node:assert/strict";
import type { PokemonCard } from "../types";
import {
  isCameoCard,
  matchesEeveelutionFilter,
  matchesSetFilter,
  primaryEeveelution,
  uniqueSetsFromCards,
} from "../lib/collection-filters";

function card(
  partial: Pick<PokemonCard, "id" | "name" | "set"> &
    Partial<Pick<PokemonCard, "cameoOf" | "number">>
): PokemonCard {
  return {
    supertype: "Pokémon",
    number: partial.number ?? "1",
    images: { small: "https://example.com/s.webp", large: "https://example.com/l.png" },
    variants: ["holo"],
    ...partial,
  };
}

const umbreon = card({
  id: "neo2-13",
  name: "Umbreon",
  set: { id: "neo2", name: "Neo Discovery", series: "Neo", releaseDate: "2001/06/01" },
});
const darkFlareon = card({
  id: "base5-35",
  name: "Dark Flareon",
  set: { id: "base5", name: "Team Rocket", series: "Base", releaseDate: "2000/04/24" },
});
const umbreonV = card({
  id: "swsh7-95",
  name: "Umbreon V",
  set: { id: "swsh7", name: "Evolving Skies", series: "Sword & Shield", releaseDate: "2021/08/27" },
});
const espeon = card({
  id: "neo2-2",
  name: "Espeon",
  set: { id: "neo2", name: "Neo Discovery", series: "Neo", releaseDate: "2001/06/01" },
});
const aquapolisUmbreon = card({
  id: "ecard2-H32",
  name: "Umbreon",
  number: "H32",
  set: { id: "ecard2", name: "Aquapolis", series: "E-Card", releaseDate: "2003/01/01" },
});
const oracleCameo = card({
  id: "ecard3-138",
  name: "Oracle",
  number: "138",
  cameoOf: ["Umbreon"],
  set: { id: "ecard3", name: "Skyridge", series: "E-Card", releaseDate: "2003/05/12" },
});
const snorlaxCameo = card({
  id: "basep-49",
  name: "Snorlax",
  number: "49",
  cameoOf: ["Eevee"],
  set: { id: "basep", name: "Wizards Black Star Promos", series: "Base", releaseDate: "1999/07/01" },
});
const multiCameo = card({
  id: "sv1-239",
  name: "Penny",
  number: "239",
  cameoOf: ["Eevee", "Umbreon"],
  set: { id: "sv1", name: "Scarlet & Violet", series: "Scarlet & Violet", releaseDate: "2023/03/31" },
});
const tPromoVaporeon = card({
  id: "tpp-jp-2",
  name: "Vaporeon",
  number: "2",
  cameoOf: ["Jolteon", "Flareon"],
  set: { id: "tpp", name: "T Promos", series: "Other", releaseDate: "1999/01/01" },
});
const leafeon = card({
  id: "dp1-24",
  name: "Leafeon",
  set: { id: "dp1", name: "Diamond & Pearl", series: "Diamond & Pearl", releaseDate: "2007/05/01" },
});

assert.equal(primaryEeveelution(umbreon), "Umbreon");
assert.equal(primaryEeveelution(darkFlareon), "Flareon");
assert.equal(primaryEeveelution(umbreonV), "Umbreon");
assert.equal(primaryEeveelution(leafeon), "Leafeon");
assert.equal(primaryEeveelution(snorlaxCameo), null);
assert.equal(isCameoCard(oracleCameo), true);
assert.equal(isCameoCard(umbreon), false);

{
  assert.equal(matchesEeveelutionFilter(umbreon, "all", false), true);
  assert.equal(matchesEeveelutionFilter(oracleCameo, "all", false), false);
  assert.equal(matchesEeveelutionFilter(snorlaxCameo, "all", false), false);
}

{
  assert.equal(matchesEeveelutionFilter(umbreon, "all", true), true);
  assert.equal(matchesEeveelutionFilter(oracleCameo, "all", true), true);
  assert.equal(matchesEeveelutionFilter(snorlaxCameo, "all", true), true);
}

{
  assert.equal(matchesEeveelutionFilter(umbreon, "Umbreon", false), true);
  assert.equal(matchesEeveelutionFilter(umbreonV, "Umbreon", false), true);
  assert.equal(matchesEeveelutionFilter(oracleCameo, "Umbreon", false), false);
  assert.equal(matchesEeveelutionFilter(espeon, "Umbreon", false), false);
}

{
  assert.equal(matchesEeveelutionFilter(umbreon, "Umbreon", true), true);
  assert.equal(matchesEeveelutionFilter(oracleCameo, "Umbreon", true), true);
  assert.equal(matchesEeveelutionFilter(multiCameo, "Umbreon", true), true);
  assert.equal(matchesEeveelutionFilter(snorlaxCameo, "Umbreon", true), false);
}

{
  assert.equal(matchesEeveelutionFilter(espeon, "Espeon", false), true);
  assert.equal(matchesEeveelutionFilter(oracleCameo, "Espeon", true), false);
}

{
  assert.equal(matchesEeveelutionFilter(tPromoVaporeon, "all", false), false);
  assert.equal(matchesEeveelutionFilter(tPromoVaporeon, "Vaporeon", false), false);
  assert.equal(matchesEeveelutionFilter(tPromoVaporeon, "Vaporeon", true), true);
  assert.equal(matchesEeveelutionFilter(tPromoVaporeon, "Jolteon", true), true);
  assert.equal(matchesEeveelutionFilter(tPromoVaporeon, "Umbreon", true), false);
}

{
  assert.equal(matchesSetFilter(aquapolisUmbreon, "all"), true);
  assert.equal(matchesSetFilter(aquapolisUmbreon, "Aquapolis"), true);
  assert.equal(matchesSetFilter(umbreon, "Aquapolis"), false);
}

{
  const sets = uniqueSetsFromCards([
    umbreon,
    espeon,
    aquapolisUmbreon,
    darkFlareon,
  ]);
  assert.deepEqual(
    sets.map((s) => s.name),
    ["Team Rocket", "Neo Discovery", "Aquapolis"]
  );
}

{
  const cards = [umbreon, oracleCameo, aquapolisUmbreon, snorlaxCameo];
  const combined = cards.filter(
    (c) =>
      matchesEeveelutionFilter(c, "Umbreon", true) &&
      matchesSetFilter(c, "Aquapolis")
  );
  assert.equal(combined.length, 1);
  assert.equal(combined[0].id, aquapolisUmbreon.id);
}

console.log("test-collection-filters: ok");

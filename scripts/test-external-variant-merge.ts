import assert from "node:assert/strict";
import type { PokemonCard } from "../types";
import {
  applyExternalVariantsToCards,
  finalizeMasterSetCatalog,
  mergeExternalVariantsOntoCard,
  type ExternalVariantMergeResult,
  type ExternalCatalogEntry,
} from "../lib/external-variant-catalog";
import { mergeCatalogueCards } from "../lib/merge-catalogue";
import { mergeVariantLists } from "../lib/merge-variants";
import {
  classifyExternalVariantLabel,
  externalVariantToKey,
} from "../lib/variant-labels";

const jungleSet = {
  id: "base2",
  name: "Jungle",
  series: "Base",
  releaseDate: "1999/06/16",
};

const images = {
  small: "https://example.com/s.webp",
  large: "https://example.com/l.png",
};

function makeCard(
  id: string,
  name: string,
  number: string,
  variants: string[]
): PokemonCard {
  return {
    id,
    name,
    number,
    supertype: "Pokémon",
    set: jungleSet,
    images,
    variants,
  };
}

function entry(
  name: string,
  number: string,
  variantLabel: string | null,
  setName = "Jungle"
): ExternalCatalogEntry {
  return {
    name,
    setName,
    number,
    variantLabel,
    sourceFile: "testExternal.json",
  };
}

const jungleFlareonRealCatalog = [
  entry("Flareon", "3", "1st Edition"),
  entry("Flareon", "3", "Unlimited"),
];

{
  const merged = mergeVariantLists(["holo"], ["firstEdition", "reverse"]);
  assert.deepEqual(merged, ["reverse", "holo", "firstEdition"]);
}

{
  assert.equal(externalVariantToKey(null), "normal");
  assert.equal(externalVariantToKey("Reverse Holo"), "reverse");
  assert.equal(externalVariantToKey("Poke Ball"), "pokeball");
  assert.deepEqual(classifyExternalVariantLabel("Unlimited"), {
    key: "normal",
    kind: "ambiguous",
  });
  assert.deepEqual(classifyExternalVariantLabel(null), {
    key: "normal",
    kind: "ambiguous",
  });
  assert.deepEqual(classifyExternalVariantLabel("Holo"), {
    key: "holo",
    kind: "explicit",
  });
}

{
  const { cards } = applyExternalVariantsToCards(
    [makeCard("base2-3", "Flareon", "3", ["holo"])],
    jungleFlareonRealCatalog
  );
  const flareon = cards.find((c) => c.id === "base2-3");
  assert.ok(flareon);
  assert.deepEqual(flareon!.variants, ["holo", "firstEdition"]);
  assert.ok(!flareon!.variants!.includes("normal"));
}

{
  const { cards } = applyExternalVariantsToCards(
    [makeCard("base2-19", "Flareon", "19", ["normal"])],
    [entry("Flareon", "19", "Unlimited"), entry("Flareon", "19", "1st Edition")]
  );
  assert.deepEqual(cards[0].variants, ["normal", "firstEdition"]);
}

{
  const { cards } = applyExternalVariantsToCards(
    [makeCard("base2-4", "Jolteon", "4", ["holo"])],
    [entry("Jolteon", "4", null, "Jungle")]
  );
  assert.deepEqual(cards[0].variants, ["holo"]);
}

{
  const { cards } = applyExternalVariantsToCards(
    [
      {
        ...makeCard("col1-1", "Flareon", "1", ["normal"]),
        set: {
          id: "col1",
          name: "Call of Legends",
          series: "HeartGold & SoulSilver",
          releaseDate: "2011/02/09",
        },
      },
    ],
    [
      entry("Flareon", "1", "Holo", "Call of Legends"),
      entry("Flareon", "1", "Reverse Holo", "Call of Legends"),
    ]
  );
  assert.ok(cards[0].variants!.includes("normal"));
  assert.ok(cards[0].variants!.includes("holo"));
  assert.ok(cards[0].variants!.includes("reverse"));
}

{
  const { cards } = applyExternalVariantsToCards(
    [
      {
        ...makeCard("sv1-1", "Flareon", "1", ["normal"]),
        set: {
          id: "sv1",
          name: "Scarlet & Violet",
          series: "Scarlet & Violet",
          releaseDate: "2023/03/31",
        },
      },
    ],
    [entry("Flareon", "1", "Poké Ball", "Scarlet & Violet")]
  );
  assert.ok(cards[0].variants!.includes("pokeball"));
}

{
  const base = makeCard("base2-3", "Flareon", "3", ["holo", "firstEdition"]);
  const manual: PokemonCard = {
    ...base,
    variants: ["pokeball"],
  };
  const { cards } = mergeCatalogueCards([base], [manual]);
  const flareon = cards.find((c) => c.id === "base2-3");
  assert.ok(flareon?.variants?.includes("holo"));
  assert.ok(flareon?.variants?.includes("firstEdition"));
  assert.ok(flareon?.variants?.includes("pokeball"));
}

{
  const { cards } = applyExternalVariantsToCards(
    [makeCard("mcd19-1", "Eevee", "1", ["holo"])],
    [entry("Eevee", "1", null, "McDonald's Collection 2019")]
  );
  assert.deepEqual(cards[0].variants, ["holo"]);
}

{
  const { cards } = applyExternalVariantsToCards(
    [makeCard("empty-1", "Sample", "1", [])],
    [entry("Sample", "1", null, "Jungle")]
  );
  assert.deepEqual(cards[0].variants, ["normal"]);
}

{
  const card = makeCard("base2-3", "Flareon", "3", ["holo"]);
  const once = mergeExternalVariantsOntoCard(card, ["firstEdition"], ["normal"]);
  const twice = mergeExternalVariantsOntoCard(
    { ...card, variants: once },
    ["firstEdition"],
    ["normal"]
  );
  assert.deepEqual(once, twice);
  const { cards: firstPass } = applyExternalVariantsToCards([card], jungleFlareonRealCatalog);
  const { cards: secondPass } = applyExternalVariantsToCards(firstPass, jungleFlareonRealCatalog);
  assert.deepEqual(firstPass[0].variants, secondPass[0].variants);
}

{
  const manualOnly: PokemonCard = {
    id: "cbb2c-1001",
    name: "Sample",
    number: "1",
    supertype: "Pokémon",
    set: {
      id: "cbb2c",
      name: "Gem Pack Vol. 2",
      series: "Chinese",
      releaseDate: "2024/01/01",
    },
    images,
    variants: ["holo"],
  };
  const report: ExternalVariantMergeResult = {
    variantsByCardId: new Map(),
    ambiguousByCardId: new Map(),
    unmatched: [],
    duplicateSkips: 0,
  };
  const finalized = finalizeMasterSetCatalog([manualOnly], report, new Set(["cbb2c-1001"]));
  assert.deepEqual(finalized[0].variants, ["holo"]);
}

{
  const manualNoVariants: PokemonCard = {
    ...makeCard("cbb2c-1002", "Sample", "2", []),
    id: "cbb2c-1002",
    set: {
      id: "cbb2c",
      name: "Gem Pack Vol. 2",
      series: "Chinese",
      releaseDate: "2024/01/01",
    },
  };
  const report: ExternalVariantMergeResult = {
    variantsByCardId: new Map(),
    ambiguousByCardId: new Map(),
    unmatched: [],
    duplicateSkips: 0,
  };
  const finalized = finalizeMasterSetCatalog(
    [manualNoVariants],
    report,
    new Set(["cbb2c-1002"])
  );
  assert.deepEqual(finalized[0].variants, ["normal"]);
}

console.log("test-external-variant-merge: ok");

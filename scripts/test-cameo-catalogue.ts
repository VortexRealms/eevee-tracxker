/**
 * Offline tests for the Eeveelution cameo catalogue pipeline.
 *
 * Run with: npm run test:cameo-catalogue
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyCameoMetadata,
  cameoMasterSetIds,
  cameoOfByCatalogueId,
  loadCameoCatalogue,
  physicalKey,
  validateCameoCatalogue,
} from "../lib/cameo-catalogue";
import { buildCameoManualStub, isCameoManualEntry } from "../lib/cameo-manual-stubs";
import { CARD_BACK_IMAGE, hasCustomCardImages } from "../lib/card-image-placeholder";
import { isMasterSetCatalogueCard } from "../lib/master-set-extras";
import type { PokemonCard } from "../types";
import { searchNumberForCard } from "./pokewallet-price-utils";

const catalogue = loadCameoCatalogue();

{
  const errors = validateCameoCatalogue(catalogue);
  assert.equal(errors.length, 0, `validation errors: ${errors.join("; ")}`);
}

{
  assert.ok(catalogue.entries.length >= 69, `expected >=69 entries, got ${catalogue.entries.length}`);
  const keys = new Set(catalogue.entries.map((e) => e.key));
  assert.equal(keys.size, catalogue.entries.length, "duplicate physical keys");
}

{
  assert.equal(hasCustomCardImages(undefined), false);
  assert.equal(hasCustomCardImages(CARD_BACK_IMAGE), false);
  assert.equal(
    hasCustomCardImages({
      small: "https://sleevee.de/media/example.jpg",
      large: "https://sleevee.de/media/example.jpg",
    }),
    true
  );
}

{
  const bwpKey = physicalKey("ja", "BW-P Promos", "190", "Pokémon Center");
  const bwp = catalogue.entries.find((e) => e.key === bwpKey);
  assert.ok(bwp, "BW-P #190 entry missing");
  assert.equal(bwp!.cameoOf.length, 8, "BW-P #190 should aggregate 8 Eeveelutions");
  assert.equal(bwp!.catalogueId, "bwp-190");
}

{
  const byId = cameoOfByCatalogueId();
  assert.deepEqual(byId.get("swsh7-212")?.sort(), ["Eevee", "Vaporeon"].sort());
  assert.deepEqual(byId.get("sv4pt5-236")?.sort(), ["Eevee", "Sylveon"].sort());
}

{
  const cards: PokemonCard[] = [
    {
      id: "sv4pt5-236",
      name: "Clive",
      number: "236",
      supertype: "Trainer",
      set: {
        id: "sv4pt5",
        name: "Paldean Fates",
        series: "Scarlet & Violet",
        releaseDate: "2024/01/26",
      },
      images: { small: "https://example.com/s.webp", large: "https://example.com/l.png" },
    },
  ];
  const enriched = applyCameoMetadata(cards);
  assert.deepEqual(enriched[0].cameoOf, ["Eevee", "Sylveon"]);
}

{
  const dawn = catalogue.entries.find((e) => e.catalogueId === "dp5-79");
  assert.ok(dawn, "Dawn Stadium dp5-79 missing from cameo catalogue");
  assert.deepEqual(
    [...(dawn!.cameoOf ?? [])].sort(),
    ["Glaceon", "Leafeon"]
  );

  const byId = cameoOfByCatalogueId();
  assert.deepEqual(byId.get("dp5-79"), ["Leafeon", "Glaceon"]);

  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8")) as PokemonCard[];
  const printed = cards.find((c) => c.id === "dp5-79");
  assert.ok(printed, "dp5-79 missing from cards.json");
  assert.deepEqual([...(printed!.cameoOf ?? [])].sort(), ["Glaceon", "Leafeon"]);
  assert.deepEqual(printed!.variants, ["normal", "reverse"]);
}

{
  const masterIds = cameoMasterSetIds();
  assert.ok(masterIds.has("basep-49"), "cameo EN card should be master-set whitelisted");
  assert.ok(masterIds.has("bwp-190"), "cameo manual card should be master-set whitelisted");
  assert.ok(masterIds.has("wcd2010-espeon"), "2010 Worlds Psychic Energy manual slot whitelisted");
  assert.ok(
    isMasterSetCatalogueCard("sv1-183", new Set()),
    "included cameo card retains variant slots"
  );
}

{
  const manualEntries = catalogue.entries.filter(isCameoManualEntry);
  assert.ok(manualEntries.length >= 20, `expected manual cameo stubs, got ${manualEntries.length}`);
  for (const entry of manualEntries.slice(0, 5)) {
    const stub = buildCameoManualStub(entry);
    assert.equal(stub.id, entry.catalogueId);
    assert.equal(stub.catalogueLanguage, entry.language);
  }

  const zeraoraEntry = catalogue.entries.find((e) => e.catalogueId === "smp-jp-zeraora-jumbo");
  assert.ok(zeraoraEntry, "Zeraora and Friends cameo entry missing");
  assert.deepEqual(buildCameoManualStub(zeraoraEntry!).variants, ["jumbo"]);
}

{
  const csCard: PokemonCard = {
    id: "cs6bc-2207",
    name: "Floragato",
    number: "2207",
    supertype: "Pokémon",
    catalogueLanguage: "zh-cn",
    set: {
      id: "cs6bc",
      name: "Gem Pack Vol. 5",
      series: "Other",
      releaseDate: "2025/01/01",
    },
    images: { small: "https://example.com/s.webp", large: "https://example.com/l.png" },
  };
  assert.equal(searchNumberForCard(csCard), "2207");
}

{
  const cardsPath = path.join(process.cwd(), "data", "cards.json");
  if (fs.existsSync(cardsPath)) {
    const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8")) as PokemonCard[];
    const byId = cameoOfByCatalogueId();
    let cameoCount = 0;
    for (const card of cards) {
      if (byId.has(card.id)) cameoCount++;
    }
    assert.ok(
      cameoCount >= catalogue.entries.filter((e) => e.catalogueId && e.resolution !== "ambiguous").length - 9,
      `cards.json should contain most cameo printings (found ${cameoCount})`
    );

    const ids = new Set(cards.map((c) => c.id));
    assert.equal(ids.size, cards.length, "cards.json must not duplicate catalogue IDs");

    const bwp190 = cards.find((c) => c.id === "bwp-190");
    assert.ok(bwp190, "bwp-190 missing from cards.json");
    assert.equal(
      hasCustomCardImages(bwp190!.images),
      true,
      "BW-P #190 Pokémon Center should use custom art, not the card back"
    );

    const pikachu2012 = cards.find((c) => c.id === "bwp-2012");
    assert.ok(pikachu2012, "bwp-2012 missing from cards.json");
    assert.equal(
      hasCustomCardImages(pikachu2012!.images),
      true,
      "BW-P _____'s Pikachu jumbo should use custom art, not the card back"
    );

    const poncho142 = cards.find((c) => c.id === "smp-jp-poncho-142");
    assert.ok(poncho142, "smp-jp-poncho-142 missing from cards.json");
    assert.equal(
      hasCustomCardImages(poncho142!.images),
      true,
      "SM-P #142 Poncho-wearing Eevee should use custom art, not the card back"
    );

    for (const n of [137, 138, 139, 140, 141, 143, 144]) {
      const poncho = cards.find((c) => c.id === `smp-jp-poncho-${n}`);
      assert.ok(poncho, `smp-jp-poncho-${n} missing from cards.json`);
      assert.equal(
        poncho!.images.small,
        `/media/ponchoEevee${n}.webp`,
        `SM-P #${n} Poncho-wearing Eevee should use the local scan`
      );
    }

    const sm1101a = cards.find((c) => c.id === "sm1-101a");
    assert.ok(sm1101a, "sm1-101a missing from cards.json");
    assert.equal(
      sm1101a!.images.small,
      "/media/SUM_101a_R_EN.webp",
      "Sun & Moon Eevee #101a should use the local reverse scan"
    );

    const zeraoraJumbo = cards.find((c) => c.id === "smp-jp-zeraora-jumbo");
    assert.ok(zeraoraJumbo, "smp-jp-zeraora-jumbo missing from cards.json");
    assert.deepEqual(zeraoraJumbo!.variants, ["jumbo"]);
    assert.equal(
      zeraoraJumbo!.images.small,
      "/media/smp-zeraoraandfriends-jumbo-promo.webp",
      "SM-P Zeraora and Friends jumbo should use the local scan"
    );

    const sapporoPikachu = cards.find((c) => c.id === "smp-jp-005");
    assert.ok(sapporoPikachu, "smp-jp-005 missing from cards.json");
    assert.equal(
      sapporoPikachu!.images.small,
      "/media/Sapporos-Pikachu.webp",
      "SM-P #5 Sapporo's Pikachu should use the local scan"
    );
  }
}

console.log(`OK: cameo catalogue (${catalogue.entries.length} entries) validated`);

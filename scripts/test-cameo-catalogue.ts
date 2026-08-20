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

    const meeEeveeAr = cards.find((c) => c.id === "MEE-20");
    assert.ok(meeEeveeAr, "MEE-20 missing from cards.json");
    assert.equal(
      meeEeveeAr!.images.small,
      "/media/mee20jpg.webp",
      "MEE 020/019 Eevee AR should use the local scan"
    );

    for (const [id, image] of [
      ["MEE-001", "/media/mee01.webp"],
      ["MEE-008", "/media/mee008.webp"],
      ["MEE-009", "/media/mee009.webp"],
    ] as const) {
      const card = cards.find((c) => c.id === id);
      assert.ok(card, `${id} missing from cards.json`);
      assert.equal(card!.set.id, "MEE", `${id} should be in Starter Set ex Eevee ex`);
      assert.equal(card!.catalogueLanguage, "ja", `${id} should be JP catalogue language`);
      assert.equal(card!.images.small, image, `${id} should use the local scan`);
    }

    for (const [id, name, image] of [
      ["vs-56", "Sabrina's Espeon", "/media/vs-56.webp"],
      ["vs-76", "Will's Espeon", "/media/vs-76.webp"],
      ["vs-89", "Karen's Flareon", "/media/vs-89.webp"],
      ["vs-91", "Karen's Umbreon", "/media/vs-91.webp"],
    ] as const) {
      const card = cards.find((c) => c.id === id);
      assert.ok(card, `${id} missing from cards.json`);
      assert.equal(card!.name, name, `${id} should keep the trainer Pokémon name`);
      assert.equal(card!.set.id, "vs", `${id} should be in Pokémon VS`);
      assert.equal(card!.catalogueLanguage, "ja", `${id} should be JP catalogue language`);
      assert.equal(card!.images.small, image, `${id} should use the local scan`);
    }

    for (const [id, name] of [
      ["svp-jp-062", "Eevee"],
      ["svp-jp-063", "Vaporeon"],
      ["svp-jp-064", "Jolteon"],
      ["svp-jp-065", "Flareon"],
      ["svp-jp-066", "Espeon"],
      ["svp-jp-067", "Umbreon"],
      ["svp-jp-068", "Leafeon"],
      ["svp-jp-069", "Glaceon"],
      ["svp-jp-070", "Sylveon"],
    ] as const) {
      const card = cards.find((c) => c.id === id);
      assert.ok(card, `${id} missing from cards.json`);
      assert.equal(card!.name, name, `${id} should keep the Eeveelution name`);
      assert.equal(card!.set.id, "svp-jp", `${id} should be in Japanese SV-P Promos`);
      assert.equal(card!.catalogueLanguage, "ja", `${id} should be JP catalogue language`);
      assert.deepEqual(card!.variants, ["holo"], `${id} should be holo-only`);
      assert.ok(
        card!.images.small.includes("tcgplayer-cdn.tcgplayer.com/product/"),
        `${id} should use the TCGPlayer scan (Scrydex maps these numbers to English SVP)`
      );
    }

    const munchEevee = cards.find((c) => c.id === "smp-jp-287");
    assert.ok(munchEevee, "smp-jp-287 missing from cards.json");
    assert.equal(munchEevee!.name, "Eevee");
    assert.equal(munchEevee!.set.id, "smp-jp");
    assert.equal(munchEevee!.number, "287");
    assert.equal(munchEevee!.catalogueLanguage, "ja");
    assert.deepEqual(munchEevee!.variants, ["holo"]);
    assert.ok(
      munchEevee!.images.small.includes("598364"),
      "SM-P 287 Eevee should use the TCGPlayer Munch scan"
    );

    const friendlyShopEevee = cards.find((c) => c.id === "smp-jp-371");
    assert.ok(friendlyShopEevee, "smp-jp-371 missing from cards.json");
    assert.equal(friendlyShopEevee!.name, "Eevee");
    assert.equal(friendlyShopEevee!.set.id, "smp-jp");
    assert.equal(friendlyShopEevee!.number, "371");
    assert.equal(friendlyShopEevee!.catalogueLanguage, "ja");
    assert.deepEqual(friendlyShopEevee!.variants, ["holo"]);
    assert.ok(
      friendlyShopEevee!.images.small.includes("598448"),
      "SM-P 371 Eevee should use the TCGPlayer Friendly Shop scan"
    );

    const friendlyShopEeveeOct = cards.find((c) => c.id === "smp-jp-399");
    assert.ok(friendlyShopEeveeOct, "smp-jp-399 missing from cards.json");
    assert.equal(friendlyShopEeveeOct!.name, "Eevee");
    assert.equal(friendlyShopEeveeOct!.set.id, "smp-jp");
    assert.equal(friendlyShopEeveeOct!.number, "399");
    assert.equal(friendlyShopEeveeOct!.catalogueLanguage, "ja");
    assert.deepEqual(friendlyShopEeveeOct!.variants, ["holo"]);
    assert.ok(
      friendlyShopEeveeOct!.images.small.includes("598476"),
      "SM-P 399 Eevee should use the TCGPlayer Friendly Shop scan"
    );

    const vendingEevee = cards.find((c) => c.id === "vending1-032");
    assert.ok(vendingEevee, "vending1-032 missing from cards.json");
    assert.equal(vendingEevee!.name, "Eevee");
    assert.equal(vendingEevee!.number, "032");
    assert.equal(vendingEevee!.set.id, "vending1");
    assert.equal(vendingEevee!.set.name, "Expansion Sheet 1");
    assert.equal(vendingEevee!.catalogueLanguage, "ja");
    assert.deepEqual(vendingEevee!.variants, ["normal"]);
    assert.ok(
      vendingEevee!.images.small.includes("617447"),
      "Expansion Sheet 1 Eevee should use the TCGPlayer vending scan"
    );
  }
}

console.log(`OK: cameo catalogue (${catalogue.entries.length} entries) validated`);

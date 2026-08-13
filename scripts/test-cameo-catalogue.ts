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
  }
}

console.log(`OK: cameo catalogue (${catalogue.entries.length} entries) validated`);

/**
 * Populate data/variant-price-mappings.json with one entry per catalogue variant slot
 * (every card × variant in data/cards.json). Legacy Sheet/SQLite mismatches are pre-filled
 * where unambiguous; null/empty means manual-only or already aligned.
 *
 * Not used at runtime yet. Run with: npm run build:variant-price-mappings
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { buildSortedCatalogueSlots } from "../lib/catalogue-slots";
import { getAllCards } from "../lib/cards";
import type { PokemonCard } from "../types";
import { loadEnvFiles } from "./load-env";

interface MappingEntry {
  cardName: string;
  setName: string;
  cardNumber: string;
  priceSheetVariant: string | null;
  sqliteVariants: string[];
  note?: string;
}

const OUTPUT_PATH = path.join(process.cwd(), "data", "variant-price-mappings.json");
const SQLITE_PATH = path.join(process.cwd(), "data", "price-history.sqlite");

function catalogueVariantsFor(card: PokemonCard): string[] {
  return card.variants?.length ? card.variants : ["normal"];
}

function parseVariantsJson(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(raw) as Record<string, unknown>));
  } catch {
    return new Set();
  }
}

function priceSheetVariantForSlot(
  catalogueVariant: string,
  priceKeys: Set<string>,
  catalogueVariants: string[]
): string | null {
  if (priceKeys.has(catalogueVariant)) return catalogueVariant;

  const orphanKeys = [...priceKeys].filter((k) => !catalogueVariants.includes(k));
  if (catalogueVariants.length === 1 && orphanKeys.length === 1) {
    return orphanKeys[0];
  }

  return null;
}

function buildCardContext(input: {
  card: PokemonCard;
  priceKeys: Set<string>;
  sqliteVariants: Set<string>;
}) {
  const { card, priceKeys, sqliteVariants } = input;
  const catalogueVariants = catalogueVariantsFor(card);
  const orphanPriceKeys = [...priceKeys].filter((k) => !catalogueVariants.includes(k));
  const orphanSqliteVariants = [...sqliteVariants].filter((v) => !catalogueVariants.includes(v));

  return { catalogueVariants, orphanPriceKeys, orphanSqliteVariants };
}

function sqliteVariantsForSlot(
  slotVariant: string,
  catalogueVariants: string[],
  sqliteVariants: Set<string>,
  isFirstSlot: boolean
): string[] {
  const orphans = [...sqliteVariants].filter((v) => !catalogueVariants.includes(v));
  if (orphans.length === 0) return [];

  if (catalogueVariants.length === 1) {
    return orphans;
  }

  // Multi-variant: orphan history keys land on first slot until moved manually.
  return isFirstSlot ? orphans : [];
}

function noteForSlot(input: {
  catalogueVariants: string[];
  slotVariant: string;
  isFirstSlot: boolean;
  orphanPriceKeys: string[];
  orphanSqliteVariants: string[];
  priceSheetVariant: string | null;
}): string | undefined {
  const parts: string[] = [];

  if (input.catalogueVariants.length > 1 && input.isFirstSlot) {
    if (input.orphanSqliteVariants.length > 0) {
      parts.push(
        `Move sqliteVariants to the slot that should read history stored as ${input.orphanSqliteVariants.map((v) => `"${v}"`).join(", ")}.`
      );
    }
    if (input.orphanPriceKeys.length > 0 && input.priceSheetVariant == null) {
      parts.push(
        `Orphan price keys in Sheet (${input.orphanPriceKeys.join(", ")}) — map to the right slot or ignore.`
      );
    }
  }

  if (input.catalogueVariants.length === 1 && input.priceSheetVariant != null) {
    if (input.priceSheetVariant !== input.slotVariant) {
      parts.push(
        `priceSheetVariant "${input.priceSheetVariant}" differs from catalogue "${input.slotVariant}" (single-variant alias).`
      );
    }
  }

  if (parts.length === 0 && input.priceSheetVariant == null && input.catalogueVariants.length > 1) {
    if (!input.catalogueVariants.includes(input.slotVariant)) return undefined;
    const hasApiSibling = input.catalogueVariants.some((v) => v !== input.slotVariant);
    if (hasApiSibling) {
      return "Manual price only unless you set priceSheetVariant to a Sheet key.";
    }
  }

  return parts.length > 0 ? parts.join(" ") : undefined;
}

async function main(): Promise<void> {
  await loadEnvFiles();
  const { getPricesSnapshotFromDb } = await import("../lib/price-db");

  const cards = getAllCards();
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const slots = buildSortedCatalogueSlots(cards);

  const priceKeysByCardId = new Map<string, Set<string>>();
  const priceSnapshot = getPricesSnapshotFromDb();
  for (const [cardId, entry] of Object.entries(priceSnapshot.entries)) {
    if (!cardById.has(cardId)) continue;
    const keys = new Set<string>();
    if (entry.usd != null || entry.eur != null) {
      keys.add("normal");
    }
    for (const variantKey of Object.keys(entry.variants ?? {})) {
      keys.add(variantKey);
    }
    priceKeysByCardId.set(cardId, keys);
  }

  const sqliteByCardId = new Map<string, Set<string>>();
  const unresolvedCardIds = new Set<string>();

  if (fs.existsSync(SQLITE_PATH)) {
    const db = new Database(SQLITE_PATH, { readonly: true });
    try {
      const rows = db
        .prepare(`SELECT DISTINCT card_id, variant FROM price_history`)
        .all() as Array<{ card_id: string; variant: string }>;
      for (const row of rows) {
        if (!cardById.has(row.card_id)) {
          unresolvedCardIds.add(`${row.card_id}:${row.variant}`);
          continue;
        }
        if (!sqliteByCardId.has(row.card_id)) sqliteByCardId.set(row.card_id, new Set());
        sqliteByCardId.get(row.card_id)!.add(row.variant);
      }
    } finally {
      db.close();
    }
  }

  const entries: Record<string, MappingEntry> = {};

  for (const slot of slots) {
    const card = slot.card;
    const catalogueVariants = catalogueVariantsFor(card);
    const isFirstSlot = slot.variant === catalogueVariants[0];
    const ctx = buildCardContext({
      card,
      priceKeys: priceKeysByCardId.get(card.id) ?? new Set(),
      sqliteVariants: sqliteByCardId.get(card.id) ?? new Set(),
    });

    const priceSheetVariant = priceSheetVariantForSlot(
      slot.variant,
      priceKeysByCardId.get(card.id) ?? new Set(),
      catalogueVariants
    );

    const entry: MappingEntry = {
      cardName: card.name,
      setName: card.set.name,
      cardNumber: card.number,
      priceSheetVariant,
      sqliteVariants: sqliteVariantsForSlot(
        slot.variant,
        catalogueVariants,
        sqliteByCardId.get(card.id) ?? new Set(),
        isFirstSlot
      ),
    };

    const note = noteForSlot({
      catalogueVariants,
      slotVariant: slot.variant,
      isFirstSlot,
      orphanPriceKeys: ctx.orphanPriceKeys,
      orphanSqliteVariants: ctx.orphanSqliteVariants,
      priceSheetVariant,
    });
    if (note) entry.note = note;

    entries[`${card.id}.${slot.variant}`] = entry;
  }

  const sortedEntries: Record<string, MappingEntry> = {};
  for (const key of Object.keys(entries).sort()) {
    sortedEntries[key] = entries[key];
  }

  const output = {
    _meta: {
      schemaVersion: 2,
      description:
        "One entry per catalogue variant slot. Maps prices.variantsJson and SQLite history variant keys onto each slot. Not used at runtime yet.",
      entrySchema: {
        "cards.<cardId>.<catalogueVariant>": {
          cardName: "string — identification only",
          setName: "string — identification only",
          cardNumber: "string — identification only",
          priceSheetVariant:
            "string | null — key inside prices.variantsJson; null = manual price only or no API price",
          sqliteVariants:
            "string[] — price_history variant values to read for this slot; empty = use catalogue variant as-is",
          note: "string (optional) — hints when legacy data was parked on the first variant pending manual move",
        },
      },
      generatedBy: "scripts/build-variant-price-mappings.ts",
      updatedAt: new Date().toISOString().slice(0, 10),
      notes:
        "Every catalogue slot is listed. priceSheetVariant uses the normalized key stored in prices.variantsJson (normal, holo, reverse, or firstEdition), or null for manual-only/no API pricing. sqliteVariants contains only legacy price-history aliases; empty means use the catalogue variant key as-is.",
      unresolvedCardIds: {
        description:
          "Legacy references whose base cardId no longer exists in data/cards.json.",
        ids: Array.from(unresolvedCardIds).sort(),
      },
    },
    cards: sortedEntries,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(sortedEntries).length} mapping entries (all catalogue slots)`);
  console.log(`Unresolved legacy IDs: ${unresolvedCardIds.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

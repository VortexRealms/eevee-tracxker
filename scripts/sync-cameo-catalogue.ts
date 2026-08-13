/**
 * Sync cameo catalogue into included-cards.json and manual-cards.json.
 * Writes data/cameo-resolution-report.json for deterministic rebuilds.
 *
 * Run with: npm run sync:cameo-catalogue
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { PokemonCard } from "../types";
import {
  loadCameoCatalogue,
  validateCameoCatalogue,
  type CameoCardEntry,
} from "../lib/cameo-catalogue";
import { buildCameoManualStub, isCameoManualEntry } from "../lib/cameo-manual-stubs";
import {
  includedRefToEntry,
  loadIncludedCardRefs,
  saveIncludedCardRefs,
  type IncludedCardRef,
} from "./tcgdex-card-utils";

interface ResolutionReportEntry {
  catalogueId: string;
  status:
    | "included-added"
    | "included-existing"
    | "manual-added"
    | "manual-existing"
    | "manual-updated"
    | "catalogue-existing"
    | "skipped-ambiguous"
    | "missing-id";
  cameoOf: string[];
  language: string;
  notes?: string;
}

interface ResolutionReport {
  updatedAt: string;
  totalEntries: number;
  entries: ResolutionReportEntry[];
  summary: Record<string, number>;
}

function parseCatalogueId(id: string): { setId: string; number: string } {
  if (id.startsWith("smp-jp-")) {
    return { setId: "smp-jp", number: id.slice("smp-jp-".length) };
  }
  const dash = id.indexOf("-");
  return { setId: id.slice(0, dash), number: id.slice(dash + 1) };
}

function entryToIncludedRef(entry: CameoCardEntry): IncludedCardRef {
  if (!entry.catalogueId) {
    throw new Error(`Missing catalogueId for ${entry.key}`);
  }
  const { setId, number } = parseCatalogueId(entry.catalogueId);
  return includedRefToEntry({
    id: entry.catalogueId,
    name: entry.cardName,
    setId,
    number: entry.number !== "-" ? entry.number : number,
  });
}

function sameIncludedRef(a: IncludedCardRef, b: IncludedCardRef): boolean {
  const idA = a.id ?? `${a.setId}-${a.number}`;
  const idB = b.id ?? `${b.setId}-${b.number}`;
  return idA === idB;
}

async function loadManualCards(): Promise<PokemonCard[]> {
  const manualPath = path.join(process.cwd(), "data", "manual-cards.json");
  try {
    const raw = await fs.readFile(manualPath, "utf8");
    return JSON.parse(raw) as PokemonCard[];
  } catch {
    return [];
  }
}

async function saveManualCards(cards: PokemonCard[]): Promise<void> {
  const manualPath = path.join(process.cwd(), "data", "manual-cards.json");
  cards.sort((a, b) => a.id.localeCompare(b.id));
  await fs.writeFile(manualPath, JSON.stringify(cards, null, 2) + "\n", "utf8");
}

async function main() {
  const catalogue = loadCameoCatalogue();
  const validationErrors = validateCameoCatalogue(catalogue);
  if (validationErrors.length) {
    console.error("Cameo catalogue validation failed:");
    for (const err of validationErrors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const includedRefs = await loadIncludedCardRefs();
  const manualCards = await loadManualCards();
  const manualById = new Map(manualCards.map((c) => [c.id, c]));

  const reportEntries: ResolutionReportEntry[] = [];
  let includedAdded = 0;
  let manualAdded = 0;
  let manualUpdated = 0;

  function upsertManualStub(entry: Parameters<typeof buildCameoManualStub>[0]): "manual-added" | "manual-updated" {
    const stub = buildCameoManualStub(entry);
    const existing = manualById.get(stub.id);
    if (!existing) {
      manualCards.push(stub);
      manualById.set(stub.id, stub);
      manualAdded++;
      return "manual-added";
    }

    const refreshed: PokemonCard = {
      ...existing,
      name: stub.name,
      number: stub.number,
      supertype: stub.supertype,
      set: stub.set,
      images: stub.images,
      catalogueLanguage: stub.catalogueLanguage,
      variants: existing.variants ?? stub.variants,
    };
    const idx = manualCards.findIndex((c) => c.id === stub.id);
    manualCards[idx] = refreshed;
    manualById.set(stub.id, refreshed);
    manualUpdated++;
    return "manual-updated";
  }

  for (const entry of catalogue.entries) {
    if (!entry.catalogueId) {
      reportEntries.push({
        catalogueId: entry.key,
        status: "missing-id",
        cameoOf: entry.cameoOf,
        language: entry.language,
        notes: entry.notes,
      });
      continue;
    }

    if (entry.resolution === "catalogue-existing") {
      reportEntries.push({
        catalogueId: entry.catalogueId,
        status: "catalogue-existing",
        cameoOf: entry.cameoOf,
        language: entry.language,
        notes: entry.notes,
      });
      continue;
    }

    if (isCameoManualEntry(entry)) {
      const status = upsertManualStub(entry);
      reportEntries.push({
        catalogueId: entry.catalogueId,
        status,
        cameoOf: entry.cameoOf,
        language: entry.language,
        notes: entry.notes,
      });
      continue;
    }

    const ref = entryToIncludedRef(entry);
    const exists = includedRefs.some((existing) => sameIncludedRef(existing, ref));
    if (exists) {
      reportEntries.push({
        catalogueId: entry.catalogueId,
        status: "included-existing",
        cameoOf: entry.cameoOf,
        language: entry.language,
        notes: entry.notes,
      });
      continue;
    }

    includedRefs.push(ref);
    includedAdded++;
    reportEntries.push({
      catalogueId: entry.catalogueId,
      status: "included-added",
      cameoOf: entry.cameoOf,
      language: entry.language,
      notes: entry.notes,
    });
  }

  includedRefs.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""));
  await saveIncludedCardRefs(includedRefs);
  await saveManualCards(manualCards);

  const summary: Record<string, number> = {};
  for (const row of reportEntries) {
    summary[row.status] = (summary[row.status] ?? 0) + 1;
  }

  const report: ResolutionReport = {
    updatedAt: new Date().toISOString().slice(0, 10),
    totalEntries: catalogue.entries.length,
    entries: reportEntries,
    summary,
  };

  const reportPath = path.join(process.cwd(), "data", "cameo-resolution-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`Cameo sync complete (${catalogue.entries.length} entries)`);
  console.log(`  included-cards: +${includedAdded} (${includedRefs.length} total)`);
  console.log(`  manual-cards: +${manualAdded} added, ${manualUpdated} updated (${manualCards.length} total)`);
  console.log(`  report: ${reportPath}`);
  console.log("  summary:", summary);
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("sync-cameo-catalogue.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { main as syncCameoCatalogue };

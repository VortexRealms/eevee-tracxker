/**
 * Interactive CLI to search TCGdex and manage data/included-cards.json.
 *
 * Run with:
 *   npm run cards:pick -- search "Blue's Tactics"
 *   npm run cards:pick -- search "Blue's Tactics" --set sv8pt5
 *   npm run cards:pick -- list
 *   npm run cards:pick -- remove sv8pt5-147
 */

import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Query } from "@tcgdex/sdk";
import { normalizeCardId } from "./set-id-map";
import {
  briefToDisplayRow,
  getSetMeta,
  includedRefToEntry,
  isPocketSet,
  loadIncludedCardRefs,
  saveIncludedCardRefs,
  tcgdex,
} from "./tcgdex-card-utils";

interface SearchResult {
  index: number;
  brief: { id: string; name: string };
  setName: string;
  ptcgId: string;
}

function parseArgs(argv: string[]): {
  command: string;
  query: string;
  setFilter?: string;
  dryRun: boolean;
  targetId?: string;
} {
  const dryRun = argv.includes("--dry-run");
  const filtered = argv.filter((a) => a !== "--dry-run");
  const command = filtered[0] ?? "help";

  if (command === "search") {
    const setIdx = filtered.indexOf("--set");
    const setFilter = setIdx >= 0 ? filtered[setIdx + 1] : undefined;
    const queryParts = filtered.slice(1).filter((_, i, arr) => {
      if (arr[i] === "--set") return false;
      if (i > 0 && arr[i - 1] === "--set") return false;
      return true;
    });
    return {
      command,
      query: queryParts.join(" ").trim(),
      setFilter,
      dryRun,
    };
  }

  if (command === "remove") {
    return {
      command,
      query: "",
      dryRun,
      targetId: filtered[1],
    };
  }

  return { command, query: "", dryRun };
}

async function searchCards(
  query: string,
  setFilter?: string
): Promise<SearchResult[]> {
  const results = await tcgdex.card.list(Query.create().contains("name", query));
  if (!results?.length) return [];

  const rows: SearchResult[] = [];
  let index = 1;

  for (const brief of results) {
    const full = await tcgdex.card.get(brief.id).catch(() => null);
    if (!full) continue;

    const ptcgId = normalizeCardId(full.id);
    const ptcgSetId = ptcgId.substring(0, ptcgId.lastIndexOf("-"));
    if (setFilter && ptcgSetId !== setFilter && full.set.id !== setFilter) {
      continue;
    }

    const setMeta = await getSetMeta(full.set.id);
    if (isPocketSet(setMeta.serieName)) continue;

    rows.push({
      index: index++,
      brief: { id: brief.id, name: full.name },
      setName: full.set.name,
      ptcgId,
    });
  }

  return rows;
}

async function cmdSearch(
  query: string,
  setFilter?: string,
  dryRun = false
): Promise<void> {
  if (!query) {
    console.error('Usage: npm run cards:pick -- search "Card Name" [--set sv8pt5] [--dry-run]');
    process.exit(1);
  }

  console.log(`Searching TCGdex for "${query}"${setFilter ? ` in set ${setFilter}` : ""}...\n`);
  const rows = await searchCards(query, setFilter);

  if (rows.length === 0) {
    console.log("No matching cards found.");
    return;
  }

  for (const row of rows) {
    console.log(
      `${String(row.index).padStart(3)}. ${briefToDisplayRow(row.brief, row.setName, row.ptcgId)}`
    );
  }

  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(
    "\nEnter numbers to add (e.g. 1,3) or q: "
  );
  rl.close();

  if (answer.trim().toLowerCase() === "q" || answer.trim() === "") {
    console.log("No cards added.");
    return;
  }

  const picks = answer
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));

  const existing = await loadIncludedCardRefs();
  const existingIds = new Set(
    existing.map((ref) => {
      try {
        return includedRefToEntry(ref).id;
      } catch {
        return ref.id ?? "";
      }
    })
  );

  let added = 0;
  const next = [...existing];

  for (const pick of picks) {
    const row = rows.find((r) => r.index === pick);
    if (!row) {
      console.warn(`  Skipping invalid index: ${pick}`);
      continue;
    }

    const full = await tcgdex.card.get(row.brief.id).catch(() => null);
    if (!full) {
      console.warn(`  Could not fetch card for index ${pick}`);
      continue;
    }

    const entry = includedRefToEntry(
      { id: row.ptcgId, name: full.name },
      full
    );

    if (existingIds.has(entry.id)) {
      console.log(`  Already included: ${entry.id} (${entry.name})`);
      continue;
    }

    if (dryRun) {
      console.log(`  Would add: ${entry.id} (${entry.name})`);
      added++;
      continue;
    }

    next.push(entry);
    existingIds.add(entry.id);
    added++;
    console.log(`  Added: ${entry.id} (${entry.name})`);
  }

  if (!dryRun && added > 0) {
    await saveIncludedCardRefs(next);
  }

  console.log(
    `\n${dryRun ? "Would add" : "Added"} ${added} card(s). Run npm run fetch:cards to rebuild cards.json.`
  );
}

async function cmdList(): Promise<void> {
  const refs = await loadIncludedCardRefs();
  if (refs.length === 0) {
    console.log("included-cards.json is empty.");
    return;
  }

  console.log(`${refs.length} included card(s):\n`);
  for (const ref of refs) {
    try {
      const entry = includedRefToEntry(ref);
      console.log(`  ${entry.id}  ${entry.name ?? "?"}  (${entry.setId} #${entry.number})`);
    } catch {
      console.log(`  (invalid ref) ${JSON.stringify(ref)}`);
    }
  }
}

async function cmdRemove(targetId: string | undefined, dryRun: boolean): Promise<void> {
  if (!targetId) {
    console.error("Usage: npm run cards:pick -- remove <card-id>");
    process.exit(1);
  }

  const refs = await loadIncludedCardRefs();
  const before = refs.length;
  const next = refs.filter((ref) => {
    try {
      return includedRefToEntry(ref).id !== targetId;
    } catch {
      return ref.id !== targetId;
    }
  });

  if (next.length === before) {
    console.log(`No entry found for id: ${targetId}`);
    return;
  }

  if (dryRun) {
    console.log(`Would remove: ${targetId}`);
    return;
  }

  await saveIncludedCardRefs(next);
  console.log(`Removed ${targetId}. Run npm run fetch:cards to rebuild cards.json.`);
}

function printHelp(): void {
  console.log(`Usage:
  npm run cards:pick -- search "Card Name" [--set sv8pt5] [--dry-run]
  npm run cards:pick -- list
  npm run cards:pick -- remove <card-id> [--dry-run]`);
}

async function main(): Promise<void> {
  const { command, query, setFilter, dryRun, targetId } = parseArgs(
    process.argv.slice(2)
  );

  switch (command) {
    case "search":
      await cmdSearch(query, setFilter, dryRun);
      break;
    case "list":
      await cmdList();
      break;
    case "remove":
      await cmdRemove(targetId, dryRun);
      break;
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

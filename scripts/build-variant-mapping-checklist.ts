/**
 * Generate a printable checklist of every catalogue variant slot (all cards × variants)
 * plus flags for entries that already appear in data/variant-price-mappings.json.
 *
 * Outputs (gitignored):
 *   - VARIANT_MAPPING_CHECKLIST.md
 *   - VARIANT_MAPPING_CHECKLIST.html  (open in browser → Ctrl+P to print)
 *
 * Run with: npm run build:variant-mapping-checklist
 */
import fs from "node:fs";
import path from "node:path";
import { buildSortedCatalogueSlots } from "../lib/catalogue-slots";
import { getAllCards } from "../lib/cards";
import { getVariantLabel } from "../lib/variant-labels";

const MAPPING_PATH = path.join(process.cwd(), "data", "variant-price-mappings.json");
const OUTPUT_MD = path.join(process.cwd(), "VARIANT_MAPPING_CHECKLIST.md");
const OUTPUT_HTML = path.join(process.cwd(), "VARIANT_MAPPING_CHECKLIST.html");

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flagForSlot(
  cardId: string,
  variant: string,
  mappingKeys: Set<string>,
  mappingByCardId: Map<string, string[]>
): string {
  const jsonKey = `${cardId}.${variant}`;
  if (mappingKeys.has(jsonKey)) return "FIX";
  if (mappingByCardId.has(cardId)) {
    const others = mappingByCardId.get(cardId)!.filter((k) => k !== jsonKey);
    return others.length > 0 ? `FIX (${others[0]})` : "FIX";
  }
  return "";
}

function buildHtml(input: {
  slots: ReturnType<typeof buildSortedCatalogueSlots>;
  bySet: Map<string, ReturnType<typeof buildSortedCatalogueSlots>>;
  sortedSets: string[];
  mappingKeys: Set<string>;
  mappingByCardId: Map<string, string[]>;
  mappingUpdatedAt: string;
  unresolvedIds: string[];
  flaggedSlotCount: number;
}): string {
  const {
    slots,
    bySet,
    sortedSets,
    mappingKeys,
    mappingByCardId,
    mappingUpdatedAt,
    unresolvedIds,
    flaggedSlotCount,
  } = input;

  const setSections = sortedSets
    .map((setName) => {
      const setSlots = bySet.get(setName)!;
      const rows = setSlots
        .map((slot) => {
          const jsonKey = `${slot.card.id}.${slot.variant}`;
          const variantLabel = getVariantLabel(slot.variant);
          const flag = flagForSlot(slot.card.id, slot.variant, mappingKeys, mappingByCardId);
          const flagClass = flag ? "flag-fix" : "";
          return `<tr>
  <td class="done"><span class="checkbox" aria-hidden="true"></span></td>
  <td>${escapeHtml(slot.card.name)}</td>
  <td class="num">${escapeHtml(slot.card.number)}</td>
  <td>${escapeHtml(variantLabel)}</td>
  <td class="key"><code>${escapeHtml(jsonKey)}</code></td>
  <td class="flag ${flagClass}">${escapeHtml(flag)}</td>
</tr>`;
        })
        .join("\n");

      return `<section class="set-block">
  <h2>${escapeHtml(setName)} <span class="count">(${setSlots.length})</span></h2>
  <table>
    <thead>
      <tr>
        <th class="done">Done</th>
        <th>Card</th>
        <th class="num">#</th>
        <th>Variant</th>
        <th class="key">JSON key</th>
        <th class="flag">Flag</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</section>`;
    })
    .join("\n");

  const unresolvedBlock =
    unresolvedIds.length > 0
      ? `<section class="set-block unresolved">
  <h2>Unresolved legacy IDs (not in catalogue)</h2>
  <ul>${unresolvedIds.map((id) => `<li><span class="checkbox"></span> <code>${escapeHtml(id)}</code></li>`).join("")}</ul>
</section>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Variant mapping checklist</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.35;
      color: #111;
      max-width: 100%;
      margin: 0 auto;
      padding: 1rem 1.25rem 2rem;
    }
    h1 { font-size: 1.35rem; margin: 0 0 0.5rem; }
    .meta { color: #444; margin-bottom: 0.75rem; }
    .meta p { margin: 0.25rem 0; }
    .reviewed { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0; }
    .help { font-size: 0.9rem; color: #333; margin-bottom: 1rem; }
    .set-block { margin-top: 1.25rem; break-inside: avoid; }
    .set-block h2 {
      font-size: 1rem;
      margin: 0 0 0.35rem;
      padding-bottom: 0.2rem;
      border-bottom: 1px solid #ccc;
    }
    .count { font-weight: normal; color: #555; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 0.5rem;
    }
    th, td {
      border: 1px solid #bbb;
      padding: 0.2rem 0.35rem;
      text-align: left;
      vertical-align: top;
    }
    th { background: #eee; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    .done { width: 2.2rem; text-align: center; }
    .num { width: 3rem; white-space: nowrap; }
    .key { font-size: 8.5pt; word-break: break-all; }
    .key code { font-family: Consolas, "Courier New", monospace; }
    .flag { width: 5.5rem; font-size: 8.5pt; }
    .flag-fix { background: #fff3cd !important; font-weight: 600; }
    .checkbox {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 1.5px solid #333;
      vertical-align: middle;
    }
    .unresolved ul { list-style: none; padding: 0; }
    .unresolved li { margin: 0.35rem 0; }
    @media print {
      body { padding: 0.5rem; font-size: 9pt; }
      .no-print { display: none; }
      .set-block { break-inside: auto; page-break-inside: auto; }
      .set-block h2 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      th, td { padding: 0.15rem 0.25rem; }
    }
    @page {
      size: landscape;
      margin: 12mm;
    }
  </style>
</head>
<body>
  <p class="no-print" style="background:#e8f4fc;padding:0.5rem 0.75rem;border-radius:4px;">
    <strong>Print:</strong> Ctrl+P · Use landscape if prompted · Generated ${escapeHtml(mappingUpdatedAt)}
  </p>
  <h1>Full variant mapping checklist</h1>
  <div class="meta">
    <p><strong>${slots.length}</strong> catalogue slots · <strong>${mappingKeys.size}</strong> open mapping entries · <strong>${flaggedSlotCount}</strong> slots tied to a flagged card</p>
    <p>Catalogue: <code>data/cards.json</code> · Mapping: <code>data/variant-price-mappings.json</code></p>
  </div>
  <p class="reviewed">Reviewed: __________ / ${slots.length}</p>
  <p class="help">Tick <strong>Done</strong> on paper. Edit the JSON key when a mapping is needed. <strong>FIX</strong> = already flagged in mapping JSON.</p>
${setSections}
${unresolvedBlock}
</body>
</html>`;
}

function main(): void {
  const cards = getAllCards();
  const slots = buildSortedCatalogueSlots(cards);

  const mappingKeys = new Set<string>();
  const mappingByCardId = new Map<string, string[]>();
  let mappingUpdatedAt = "?";
  let unresolvedIds: string[] = [];

  if (fs.existsSync(MAPPING_PATH)) {
    const data = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8")) as {
      _meta?: { updatedAt?: string; unresolvedCardIds?: { ids?: string[] } };
      cards?: Record<string, unknown>;
    };
    mappingUpdatedAt = data._meta?.updatedAt ?? "?";
    unresolvedIds = data._meta?.unresolvedCardIds?.ids ?? [];
    for (const key of Object.keys(data.cards ?? {})) {
      if (key.startsWith("//")) continue;
      mappingKeys.add(key);
      const dot = key.lastIndexOf(".");
      const cardId = dot >= 0 ? key.slice(0, dot) : key;
      if (!mappingByCardId.has(cardId)) mappingByCardId.set(cardId, []);
      mappingByCardId.get(cardId)!.push(key);
    }
  }

  const flaggedSlotCount = slots.filter((slot) => {
    const jsonKey = `${slot.card.id}.${slot.variant}`;
    return mappingKeys.has(jsonKey) || mappingByCardId.has(slot.card.id);
  }).length;

  const bySet = new Map<string, typeof slots>();
  for (const slot of slots) {
    const setName = slot.card.set.name;
    if (!bySet.has(setName)) bySet.set(setName, []);
    bySet.get(setName)!.push(slot);
  }

  const sortedSets = Array.from(bySet.keys()).sort((a, b) => a.localeCompare(b));

  // --- Markdown ---
  const mdLines: string[] = [
    "# Full variant mapping checklist",
    "",
    `**${slots.length}** catalogue slots · **${mappingKeys.size}** open mapping entries in JSON · **${flaggedSlotCount}** slots tied to a flagged card`,
    "",
    `Catalogue: \`data/cards.json\` · Mapping: \`data/variant-price-mappings.json\` (${mappingUpdatedAt})`,
    "",
    "Reviewed: _____ / " + slots.length,
    "",
    "Tick **Done** on paper after you checked the slot. Edit the JSON key listed when a mapping is needed.",
    "Flag **FIX** = already in mapping JSON (or another variant on this card is). Flag blank = no entry yet.",
    "",
    "Open **VARIANT_MAPPING_CHECKLIST.html** in a browser to print.",
    "",
    "Regenerate: `npm run build:variant-mapping-checklist`",
    "",
    "---",
    "",
  ];

  for (const setName of sortedSets) {
    const setSlots = bySet.get(setName)!;
    mdLines.push(`## ${setName} (${setSlots.length})`, "");
    mdLines.push("| Done | Card | # | Variant | JSON key | Flag |");
    mdLines.push("| --- | --- | --- | --- | --- | --- |");

    for (const slot of setSlots) {
      const jsonKey = `${slot.card.id}.${slot.variant}`;
      const variantLabel = getVariantLabel(slot.variant);
      const flag = flagForSlot(slot.card.id, slot.variant, mappingKeys, mappingByCardId);
      mdLines.push(
        `| [ ] | ${escapeMdCell(slot.card.name)} | ${escapeMdCell(slot.card.number)} | ${escapeMdCell(variantLabel)} | \`${jsonKey}\` | ${flag} |`
      );
    }
    mdLines.push("");
  }

  if (unresolvedIds.length > 0) {
    mdLines.push("---", "", "## Unresolved legacy IDs (not in catalogue)", "");
    for (const id of unresolvedIds) mdLines.push(`- [ ] \`${id}\``);
    mdLines.push("");
  }

  fs.writeFileSync(OUTPUT_MD, `${mdLines.join("\n")}\n`);

  // --- HTML ---
  const html = buildHtml({
    slots,
    bySet,
    sortedSets,
    mappingKeys,
    mappingByCardId,
    mappingUpdatedAt,
    unresolvedIds,
    flaggedSlotCount,
  });
  fs.writeFileSync(OUTPUT_HTML, html);

  console.log(`Wrote ${slots.length} slots to:`);
  console.log(`  ${OUTPUT_MD}`);
  console.log(`  ${OUTPUT_HTML}`);
}

main();

/**
 * One-off: scrape Set Hunter masterset pages into data/*External.json
 * Run: node scripts/scrape-sethunter-masterset.mjs
 */

import fs from "node:fs/promises";

const TARGETS = [
  { slug: "vaporeon", file: "vaporeonExternal.json", pokemon: "Vaporeon" },
  { slug: "jolteon", file: "jolteonExternal.json", pokemon: "Jolteon" },
  { slug: "flareon", file: "flareonExternal.json", pokemon: "Flareon" },
  { slug: "espeon", file: "espeonExternal.json", pokemon: "Espeon" },
  { slug: "umbreon", file: "umbreonExternal.json", pokemon: "Umbreon" },
  { slug: "leafeon", file: "leafeonExternal.json", pokemon: "Leafeon" },
  { slug: "glaceon", file: "glaceonExternal.json", pokemon: "Glaceon" },
  { slug: "sylveon", file: "sylveonExternal.json", pokemon: "Sylveon" },
];

function dec(s) {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—");
}

function parseMastersetHtml(html, pokemon) {
  const mainStart = html.indexOf("Every ");
  const mainHtml =
    mainStart >= 0
      ? html.slice(html.indexOf("set by set", mainStart))
      : html;

  const entries = [];
  const setSummaries = [];

  for (const block of mainHtml.split(/<h3[^>]*>/).slice(1)) {
    const setNameEnd = block.indexOf("<");
    if (setNameEnd < 0) continue;
    const setName = dec(block.slice(0, setNameEnd).trim());
    if (!setName || setName.startsWith("Track all")) break;

    const metaMatch = block.match(/(\d{4})\s*[\u00b7·][\s\S]*?(\d+)\s*variant/);
    const setYear = metaMatch?.[1] ?? null;

    const ulMatch = block.match(/<ul[^>]*>([\s\S]*?)<\/ul>/);
    if (!ulMatch) continue;

    let n = 0;
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let m;
    while ((m = liRe.exec(ulMatch[1]))) {
      const li = m[1];
      const text = li
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const nvMatch = text.match(
        /#([A-Za-z0-9]+(?:\/[A-Za-z0-9]+)?)\s*(?:[\u00b7·]\s*(.+))?$/
      );
      const number = nvMatch?.[1] ?? null;
      const variant = nvMatch?.[2] ? dec(nvMatch[2].trim()) : null;

      const altMatch = li.match(/alt="([^"]+)"/);
      let name = altMatch?.[1] ?? pokemon;
      if (name.includes(" — ")) {
        name = name.split(" — ")[0].trim();
      }
      name = dec(name);

      entries.push({
        name,
        setName,
        setYear,
        number,
        variant,
        label: variant
          ? `#${number} · ${variant}`
          : number
            ? `#${number}`
            : dec(text.slice(0, 120)),
      });
      n++;
    }
    if (n > 0) {
      setSummaries.push({ setName, setYear, variantCount: n });
    }
  }

  return { entries, sets: setSummaries };
}

function parseHeaderStats(html) {
  const variantMatch = html.match(
    /(\d+)\s*variants\s*across\s*(\d+)\s*sets/i
  );
  return {
    variantCount: variantMatch ? Number(variantMatch[1]) : null,
    setCount: variantMatch ? Number(variantMatch[2]) : null,
  };
}

async function scrapeOne({ slug, file, pokemon }) {
  const url = `https://getsethunter.com/masterset/${slug}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} → HTTP ${res.status}`);
  }
  const html = await res.text();
  const { entries, sets } = parseMastersetHtml(html, pokemon);
  const header = parseHeaderStats(html);

  const out = {
    _meta: {
      source: url,
      fetchedAt: new Date().toISOString().slice(0, 10),
      pokemon,
      description: `English ${pokemon} master set checklist from Set Hunter — every variant, chronologically by set`,
      variantCount: entries.length,
      setCount: sets.length,
      headerVariantCount: header.variantCount,
      headerSetCount: header.setCount,
      note: "Scraped from public page HTML; use as external reference, not canonical catalogue",
    },
    sets,
    entries,
  };

  const outPath = new URL(`../data/${file}`, import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(
    `  ${file}: ${entries.length} entries, ${sets.length} sets` +
      (header.variantCount != null ? ` (page says ${header.variantCount})` : "")
  );
}

async function main() {
  console.log("Scraping Set Hunter mastersets...\n");
  for (const target of TARGETS) {
    await scrapeOne(target);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

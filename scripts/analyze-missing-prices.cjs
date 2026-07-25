const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const cards = JSON.parse(fs.readFileSync(path.join(root, "data/cards.json"), "utf8"));
const cardList = Array.isArray(cards) ? cards : cards.cards || Object.values(cards);
const cache = JSON.parse(fs.readFileSync(path.join(root, "data/pokewallet-id-cache.json"), "utf8"));
const pricesPath = path.join(root, "data/prices.json");
const prices = fs.existsSync(pricesPath)
  ? JSON.parse(fs.readFileSync(pricesPath, "utf8"))
  : {};

function isFinitePrice(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function hasPricesJson(cardId) {
  const entry = prices[cardId];
  if (!entry || typeof entry !== "object") return false;
  if (isFinitePrice(entry.usd) || isFinitePrice(entry.eur)) return true;
  const variants = entry.variants;
  if (variants && typeof variants === "object") {
    for (const vp of Object.values(variants)) {
      if (vp && (isFinitePrice(vp.usd) || isFinitePrice(vp.eur))) return true;
    }
  }
  return false;
}

function hasPokewalletId(cardId) {
  const id = cache[cardId]?.pokewalletId;
  return typeof id === "string" && id.length > 0;
}

function formatReason(noPkid, noPricesJson) {
  const parts = [];
  if (noPkid) parts.push("no pkid");
  if (noPricesJson) {
    if (!noPkid) parts.push("no sheet price unknown");
    parts.push("prices.json empty");
  }
  return parts.join(" / ");
}

const A = [];
const B = [];
const C = [];

for (const card of cardList) {
  const id = card.id;
  const pk = hasPokewalletId(id);
  const pj = hasPricesJson(id);
  if (!pk) A.push(card);
  if (!pj) B.push(card);
  if (!pk && !pj) C.push(card);
}

// Main list: cards lacking price data (!hasPricesJson)
const listCards = B.slice().sort((a, b) => {
  const sa = (a.set?.name || "") + a.id;
  const sb = (b.set?.name || "") + b.id;
  return sa.localeCompare(sb);
});

// Also track A-only (no pkid but has prices.json)
const Aonly = A.filter((c) => hasPricesJson(c.id));

console.log("=== TOTALS ===");
console.log(`Catalogue cards: ${cardList.length}`);
console.log(`A) Missing pokewallet ID: ${A.length}`);
console.log(`B) Missing prices.json or no numeric USD/EUR: ${B.length}`);
console.log(`C) Intersection (no pkid AND no prices.json data): ${C.length}`);
console.log(`A only (no pkid but has prices.json): ${Aonly.length}`);
console.log("");

// Log excerpt
const logsDir = path.join(root, "logs");
let logNote = "(no fetch-prices log found)";
if (fs.existsSync(logsDir)) {
  const logs = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith("fetch-prices-") && f.endsWith(".log"))
    .map((f) => ({ f, m: fs.statSync(path.join(logsDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (logs.length) {
    const logPath = path.join(logsDir, logs[0].f);
    const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/);
    const hits = lines.filter(
      (l) =>
        /no data|no price data|no cached Pokewallet|This batch:|Synced.*Sheet|Fetching prices for/i.test(l)
    );
    logNote = `Latest log: ${logs[0].f}\n` + hits.slice(-15).join("\n");
  }
}
console.log("=== FETCH-PRICES LOG (summary / no data) ===");
console.log(logNote);
console.log("");

console.log("=== A) Missing pokewallet ID ===");
A.sort((a, b) => a.id.localeCompare(b.id)).forEach((card, i) => {
  console.log(
    `${i + 1}. ${card.id} | ${card.name} | ${card.number} | ${card.set?.name ?? ""} | ${formatReason(true, !hasPricesJson(card.id))}`
  );
});
console.log("");

console.log("=== B) No prices.json numeric data (numbered list) ===");
listCards.forEach((card, i) => {
  const noPk = !hasPokewalletId(card.id);
  console.log(
    `${i + 1}. ${card.id} | ${card.name} | ${card.number} | ${card.set?.name ?? ""} | ${formatReason(noPk, true)}`
  );
});
console.log("");

console.log("=== C) Intersection (no pkid AND no prices.json) ===");
C.sort((a, b) => a.id.localeCompare(b.id)).forEach((card, i) => {
  console.log(
    `${i + 1}. ${card.id} | ${card.name} | ${card.number} | ${card.set?.name ?? ""} | no pkid / prices.json empty`
  );
});

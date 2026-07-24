import type { PokemonCard } from "../types";

type SearchCard = Pick<PokemonCard, "name" | "number" | "set">;

/** CBB2C numbers like "10 04/04" or "01 01/15" — search by line only ("10", "01"). */
export function searchNumberForCard(card: SearchCard): string {
  const raw = (card.number ?? "").trim();
  if (card.set?.id === "cbb2c") {
    const line = raw.match(/^(\S+)\s+\d+\/\d+$/);
    if (line) return line[1];
  }
  return raw;
}

/** Strip leading zeros for Cardmarket (e.g. "004" -> "4", "01 01/15" -> "1 1/15"). */
export function normalizeCardNumberForCardmarket(number: string): string {
  const raw = (number ?? "").trim();
  if (/^\d+$/.test(raw)) {
    return String(parseInt(raw, 10));
  }
  return raw.replace(/(^|\D)0+(\d)/g, "$1$2");
}

/** Whole numbers for eBay / TCGplayer (no leading-zero padding). */
function normalizeCardNumberForListing(number: string): string {
  const raw = (number ?? "").trim();
  if (/^\d+$/.test(raw)) {
    return String(parseInt(raw, 10));
  }
  return raw.replace(/(^|\D)0+(\d)/g, "$1$2");
}

function buildQuery(card: SearchCard, number: string): string {
  return `${card.name} ${number}`.trim();
}

/** eBay: CBB2C keeps full slot number (e.g. "10 04/04"); other sets use normalized number. */
function ebaySearchNumberForCard(card: SearchCard): string {
  const raw = (card.number ?? "").trim();
  if (card.set?.id === "cbb2c") {
    return raw;
  }
  return normalizeCardNumberForListing(raw);
}

export function getEbaySearchUrl(card: SearchCard): string {
  const query = buildQuery(card, ebaySearchNumberForCard(card));
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
}

export function getTcgPlayerSearchUrl(card: SearchCard): string {
  const number = normalizeCardNumberForListing(searchNumberForCard(card));
  const query = buildQuery(card, number);
  return `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(query)}`;
}

export function getCardmarketSearchUrl(card: SearchCard): string {
  const number = normalizeCardNumberForCardmarket(searchNumberForCard(card));
  const query = buildQuery(card, number);
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchMode=v2&idCategory=0&searchString=${encodeURIComponent(query)}&idRarity=0`;
}

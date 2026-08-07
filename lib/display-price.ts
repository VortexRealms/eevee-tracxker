import {
  defaultPriceVariant,
  getPriceForCard,
  type ResolvedPrice,
} from "./cards";
import type { ExchangeRates } from "./exchange-rates";
import { normalizePriceAmount } from "./parse-price";
import { variantSortIndex } from "./variant-labels";
import type { DisplayCurrency, PokemonCard, PricesSnapshot } from "../types";

export type DisplayPriceSource = "native-usd" | "native-eur" | "converted" | null;

export interface DisplayAmount {
  amount: number | null;
  source: DisplayPriceSource;
}

function usdFromEur(eur: number, rates: ExchangeRates): number {
  return eur * rates.eurUsdRate;
}

function eurFromUsd(usd: number, rates: ExchangeRates): number {
  return usd / rates.eurUsdRate;
}

function otherFromEur(
  eur: number,
  currency: Exclude<DisplayCurrency, "USD" | "EUR">,
  rates: ExchangeRates
): number {
  return eur * (rates.usdRates[currency] / rates.usdRates.EUR);
}

function otherFromUsd(
  usd: number,
  currency: Exclude<DisplayCurrency, "USD" | "EUR">,
  rates: ExchangeRates
): number {
  return usd * rates.usdRates[currency];
}

export function resolveDisplayAmount(
  price: ResolvedPrice,
  currency: DisplayCurrency,
  rates: ExchangeRates
): DisplayAmount {
  const usd = normalizePriceAmount(price.usd);
  const eur = normalizePriceAmount(price.eur);

  if (currency === "USD") {
    if (usd != null) return { amount: usd, source: "native-usd" };
    if (eur != null) {
      return { amount: usdFromEur(eur, rates), source: "converted" };
    }
    return { amount: null, source: null };
  }

  if (currency === "EUR") {
    if (eur != null) return { amount: eur, source: "native-eur" };
    if (usd != null) {
      return { amount: eurFromUsd(usd, rates), source: "converted" };
    }
    return { amount: null, source: null };
  }

  if (eur != null) {
    return {
      amount: otherFromEur(eur, currency, rates),
      source: "native-eur",
    };
  }
  if (usd != null) {
    return {
      amount: otherFromUsd(usd, currency, rates),
      source: "converted",
    };
  }
  return { amount: null, source: null };
}

const LOCALE_BY_CURRENCY: Record<DisplayCurrency, string> = {
  USD: "en-US",
  EUR: "de-DE",
  HUF: "hu-HU",
  GBP: "en-GB",
};

/** Abbreviated header value (e.g. `377k Ft`, `$1.2M`). */
export function formatCompactDisplayPrice(
  amount: number | null,
  currency: DisplayCurrency
): string {
  if (amount == null) return formatDisplayPrice(null, currency);

  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 1_000_000) {
    const scaled = abs / 1_000_000;
    const text =
      scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "");
    if (currency === "HUF") return `${sign}${text}M Ft`;
    if (currency === "USD") return `${sign}$${text}M`;
    if (currency === "EUR") return `${sign}${text}M €`;
    if (currency === "GBP") return `${sign}£${text}M`;
    return `${sign}${text}M ${currency}`;
  }

  if (abs >= 1000) {
    const text = Math.round(abs / 1000);
    if (currency === "HUF") return `${sign}${text}k Ft`;
    if (currency === "USD") return `${sign}$${text}k`;
    if (currency === "EUR") return `${sign}${text}k €`;
    if (currency === "GBP") return `${sign}£${text}k`;
    return `${sign}${text}k ${currency}`;
  }

  return formatDisplayPrice(amount, currency);
}

export function formatDisplayPrice(
  amount: number | null,
  currency: DisplayCurrency
): string {
  if (amount == null) {
    const symbols: Record<DisplayCurrency, string> = {
      USD: "$",
      EUR: "€",
      HUF: "Ft",
      GBP: "£",
    };
    return `${symbols[currency]} N/A`;
  }

  const fractionDigits = currency === "HUF" ? 0 : 2;
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/** Localized amount for card price chip (e.g. `8 895` or `113,74`). */
export function formatCardPriceAmount(
  amount: number | null,
  currency: DisplayCurrency
): string | null {
  if (amount == null) return null;

  const fractionDigits = currency === "HUF" ? 0 : 2;
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/** Bold inline card price: localized number + currency code (e.g. `113,74 EUR`). */
export function formatCardPriceLabel(
  amount: number | null,
  currency: DisplayCurrency
): string {
  const formatted = formatCardPriceAmount(amount, currency);
  if (formatted == null) return "N/A";
  return `${formatted} ${currency}`;
}

export function displayPriceTitle(source: DisplayPriceSource): string | undefined {
  if (source === "converted") {
    return "Converted using current exchange rates";
  }
  if (source === "native-usd") {
    return "TCGPlayer (USD)";
  }
  if (source === "native-eur") {
    return "Cardmarket (EUR)";
  }
  return undefined;
}

export interface PriceChipTooltipInput {
  updatedAt?: string;
  source?: "pokewallet" | "manual";
  fallbackVariantLabel?: string;
  isEmpty?: boolean;
  currency?: DisplayCurrency;
}

function formatTooltipDate(updatedAt: string): string | null {
  const trimmed = updatedAt.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function priceUpdateLabel(
  source: "pokewallet" | "manual" | undefined,
  updatedAt?: string
): string {
  const verb = source === "manual" ? "Entered manually" : "Fetched";
  const formatted = updatedAt ? formatTooltipDate(updatedAt) : null;
  if (formatted) return `${verb} ${formatted}`;
  if (updatedAt?.trim()) return `${verb} (${updatedAt.trim()})`;
  return source === "manual" ? "Entered manually" : "Fetched";
}

/** Native title tooltip for card price chips (Sheet updatedAt + source). */
export function formatPriceChipTooltip(input: PriceChipTooltipInput): string | undefined {
  if (input.isEmpty) {
    return input.currency
      ? `No price available in ${input.currency}`
      : "No price available";
  }

  const updateLine = priceUpdateLabel(input.source, input.updatedAt);
  if (input.fallbackVariantLabel) {
    return `${input.fallbackVariantLabel} · ${updateLine}`;
  }
  return updateLine;
}

export function sumDisplayAmounts(
  items: Array<{ price: ResolvedPrice }>,
  currency: DisplayCurrency,
  rates: ExchangeRates
): number {
  let total = 0;
  for (const { price } of items) {
    const { amount } = resolveDisplayAmount(price, currency, rates);
    if (amount != null) total += amount;
  }
  return total;
}

export interface ListingPriceResult {
  price: ResolvedPrice;
  variant: string;
  isFallback: boolean;
  display: DisplayAmount;
}

/**
 * Price for All/Missing listings: default catalogue variant first, then lowest
 * priced other declared variant in display currency (catalogue order tie-break).
 */
export function resolveListingPrice(
  card: PokemonCard,
  prices: PricesSnapshot | null | undefined,
  currency: DisplayCurrency,
  rates: ExchangeRates
): ListingPriceResult {
  const defaultVariant = defaultPriceVariant(card);
  const defaultPrice = getPriceForCard(card, defaultVariant, prices);
  const defaultDisplay = resolveDisplayAmount(defaultPrice, currency, rates);

  if (defaultDisplay.amount != null) {
    return {
      price: defaultPrice,
      variant: defaultVariant,
      isFallback: false,
      display: defaultDisplay,
    };
  }

  const catalogueVariants = card.variants?.length ? card.variants : ["normal"];
  let best: {
    variant: string;
    price: ResolvedPrice;
    display: DisplayAmount;
  } | null = null;

  for (const variant of catalogueVariants) {
    if (variant === defaultVariant) continue;
    const price = getPriceForCard(card, variant, prices);
    const display = resolveDisplayAmount(price, currency, rates);
    if (display.amount == null) continue;

    if (
      best == null ||
      display.amount < best.display.amount! ||
      (display.amount === best.display.amount &&
        variantSortIndex(variant) < variantSortIndex(best.variant))
    ) {
      best = { variant, price, display };
    }
  }

  if (best) {
    return {
      price: best.price,
      variant: best.variant,
      isFallback: true,
      display: best.display,
    };
  }

  return {
    price: defaultPrice,
    variant: defaultVariant,
    isFallback: false,
    display: defaultDisplay,
  };
}

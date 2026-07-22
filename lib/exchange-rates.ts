import { unstable_cache } from "next/cache";
import type { DisplayCurrency, PricesMeta, PricesSnapshot } from "../types";
import { DEFAULT_EUR_USD_RATE, parseEurUsdRate } from "./price-entry-utils";

export const DISPLAY_CURRENCIES: DisplayCurrency[] = ["USD", "EUR", "HUF", "GBP"];

const FRANKFURTER_URL =
  "https://api.frankfurter.app/latest?from=USD&to=EUR,HUF,GBP";

const DEFAULT_USD_RATES: Record<Exclude<DisplayCurrency, "USD">, number> = {
  EUR: 1 / DEFAULT_EUR_USD_RATE,
  HUF: 360,
  GBP: 0.79,
};

export interface ExchangeRates {
  eurUsdRate: number;
  ratesUpdatedAt: string;
  usdRates: Record<Exclude<DisplayCurrency, "USD">, number>;
}

function normalizeUsdRates(
  partial?: Partial<Record<Exclude<DisplayCurrency, "USD">, number>>
): Record<Exclude<DisplayCurrency, "USD">, number> {
  return {
    EUR:
      typeof partial?.EUR === "number" && partial.EUR > 0
        ? partial.EUR
        : DEFAULT_USD_RATES.EUR,
    HUF:
      typeof partial?.HUF === "number" && partial.HUF > 0
        ? partial.HUF
        : DEFAULT_USD_RATES.HUF,
    GBP:
      typeof partial?.GBP === "number" && partial.GBP > 0
        ? partial.GBP
        : DEFAULT_USD_RATES.GBP,
  };
}

export function eurUsdRateFromUsdRates(
  usdRates: Record<Exclude<DisplayCurrency, "USD">, number>
): number {
  return parseEurUsdRate(1 / usdRates.EUR);
}

export function metaToExchangeRates(meta: PricesMeta): ExchangeRates {
  const usdRates = normalizeUsdRates(meta.usdRates);
  return {
    eurUsdRate: eurUsdRateFromUsdRates(usdRates),
    ratesUpdatedAt: meta.ratesUpdatedAt || new Date().toISOString().slice(0, 10),
    usdRates,
  };
}

export function exchangeRatesToMeta(rates: ExchangeRates): PricesMeta {
  return {
    ratesUpdatedAt: rates.ratesUpdatedAt,
    usdRates: rates.usdRates,
  };
}

export function parseUsdRatesJson(raw: unknown): PricesMeta["usdRates"] | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<
      Record<Exclude<DisplayCurrency, "USD">, number>
    >;
    if (!parsed || typeof parsed !== "object") return undefined;
    return normalizeUsdRates(parsed);
  } catch {
    return undefined;
  }
}

export function serializeUsdRatesJson(
  usdRates: Record<Exclude<DisplayCurrency, "USD">, number>
): string {
  return JSON.stringify(usdRates);
}

/** Fetch current rates from Frankfurter (no Next.js cache — safe for scripts). */
export async function fetchLiveExchangeRates(): Promise<ExchangeRates> {
  const res = await fetch(FRANKFURTER_URL);
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
  const data = (await res.json()) as {
    date?: string;
    rates?: Partial<Record<Exclude<DisplayCurrency, "USD">, number>>;
  };
  const usdRates = normalizeUsdRates(data.rates);
  return {
    eurUsdRate: eurUsdRateFromUsdRates(usdRates),
    ratesUpdatedAt: data.date ?? new Date().toISOString().slice(0, 10),
    usdRates,
  };
}

const getCachedLiveExchangeRates = unstable_cache(
  async () => fetchLiveExchangeRates(),
  ["eevee-tracker-exchange-rates"],
  { revalidate: 3600 }
);

/** Server entry point with 1-hour cache (API routes / SSR). */
export async function getExchangeRates(): Promise<ExchangeRates> {
  return getCachedLiveExchangeRates();
}

export function mergeRates(
  sheetMeta: PricesMeta,
  liveRates: ExchangeRates
): ExchangeRates {
  return liveRates;
}

export async function enrichPricesSnapshot(
  snapshot: PricesSnapshot
): Promise<PricesSnapshot> {
  const sheetRates = metaToExchangeRates(snapshot.meta);
  try {
    const liveRates = await getExchangeRates();
    const merged = mergeRates(snapshot.meta, liveRates);
    return {
      ...snapshot,
      meta: exchangeRatesToMeta(merged),
    };
  } catch {
    return {
      ...snapshot,
      meta: exchangeRatesToMeta(sheetRates),
    };
  }
}
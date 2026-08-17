import type { ResolvedPrice } from "../lib/cards";
import {
  formatCardPriceAmount,
  formatPriceChipTooltip,
  resolveDisplayAmount,
} from "../lib/display-price";
import type { ExchangeRates } from "../lib/exchange-rates";
import type { DisplayCurrency, PriceSource } from "../types";

interface CardPriceLabelProps {
  price: ResolvedPrice;
  currency: DisplayCurrency;
  rates: ExchangeRates;
  updatedAt?: string;
  priceSource?: PriceSource;
  priceKind?: ResolvedPrice["priceKind"];
  sampleCount?: number;
  /** Variant label when listing shows a fallback price, e.g. "Holofoil". */
  fallbackVariantLabel?: string;
}

export function CardPriceLabel({
  price,
  currency,
  rates,
  updatedAt,
  priceSource,
  priceKind,
  sampleCount,
  fallbackVariantLabel,
}: CardPriceLabelProps) {
  const { amount, source } = resolveDisplayAmount(price, currency, rates);
  const formattedAmount = formatCardPriceAmount(amount, currency);
  const isEmpty = formattedAmount == null;
  const isConverted = source === "converted";
  const title = formatPriceChipTooltip({
    updatedAt: updatedAt ?? price.updatedAt,
    source: priceSource ?? price.source,
    priceKind: priceKind ?? price.priceKind,
    sampleCount: sampleCount ?? price.sampleCount,
    fallbackVariantLabel,
    isEmpty,
    currency,
  });

  const chipClass = [
    "card-price-chip",
    isEmpty ? "is-empty" : "",
    isConverted ? "is-converted" : "",
    (priceSource ?? price.source) === "ebay" ? "is-ebay" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={chipClass} title={title}>
      {isEmpty ? (
        <span className="card-price-chip-text">N/A</span>
      ) : (
        <>
          <span className="card-price-chip-amount">{formattedAmount}</span>
          <span className="card-price-chip-currency">{currency}</span>
        </>
      )}
    </span>
  );
}

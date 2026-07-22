import type { ResolvedPrice } from "../lib/cards";
import {
  formatCardPriceAmount,
  formatPriceChipTooltip,
  resolveDisplayAmount,
} from "../lib/display-price";
import type { ExchangeRates } from "../lib/exchange-rates";
import type { DisplayCurrency } from "../types";

interface CardPriceLabelProps {
  price: ResolvedPrice;
  currency: DisplayCurrency;
  rates: ExchangeRates;
  updatedAt?: string;
  priceSource?: "pokewallet" | "manual";
  /** Variant label when listing shows a fallback price, e.g. "Holofoil". */
  fallbackVariantLabel?: string;
}

export function CardPriceLabel({
  price,
  currency,
  rates,
  updatedAt,
  priceSource,
  fallbackVariantLabel,
}: CardPriceLabelProps) {
  const { amount, source } = resolveDisplayAmount(price, currency, rates);
  const formattedAmount = formatCardPriceAmount(amount, currency);
  const isEmpty = formattedAmount == null;
  const isConverted = source === "converted";
  const title = formatPriceChipTooltip({
    updatedAt,
    source: priceSource,
    fallbackVariantLabel,
    isEmpty,
    currency,
  });

  const chipClass = [
    "card-price-chip",
    isEmpty ? "is-empty" : "",
    isConverted ? "is-converted" : "",
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

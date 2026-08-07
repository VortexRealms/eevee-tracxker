"use client";

import type { DisplayCurrency } from "../types";
import { DISPLAY_CURRENCIES, useCurrency } from "./CurrencyProvider";

const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  USD: "US Dollar (USD)",
  EUR: "Euro (EUR)",
  HUF: "Hungarian Forint (HUF)",
  GBP: "British Pound (GBP)",
};

const CURRENCY_SHORT_LABELS: Record<DisplayCurrency, string> = {
  USD: "$",
  EUR: "€",
  HUF: "Ft",
  GBP: "£",
};

interface DisplayCurrencyPickerProps {
  variant?: "chips" | "fieldset";
}

export function DisplayCurrencyPicker({ variant = "chips" }: DisplayCurrencyPickerProps) {
  const { currency, setCurrency } = useCurrency();

  if (variant === "fieldset") {
    return (
      <fieldset className="currency-fieldset">
        <legend className="sr-only">Display currency</legend>
        {DISPLAY_CURRENCIES.map((code) => (
          <label key={code} className="currency-option">
            <input
              type="radio"
              name="display-currency"
              value={code}
              checked={currency === code}
              onChange={() => setCurrency(code)}
            />
            <span>{CURRENCY_LABELS[code]}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  return (
    <div className="currency-chip-row">
      <span className="currency-chip-label">Currency</span>
      <div className="chip-row chip-row-scroll" role="group" aria-label="Display currency">
        {DISPLAY_CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            className={`filter-chip ${currency === code ? "is-active" : ""}`}
            aria-pressed={currency === code}
            aria-label={CURRENCY_LABELS[code]}
            onClick={() => setCurrency(code)}
          >
            <span className="currency-chip-short" aria-hidden="true">
              {CURRENCY_SHORT_LABELS[code]}
            </span>
            <span className="currency-chip-code">{code}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

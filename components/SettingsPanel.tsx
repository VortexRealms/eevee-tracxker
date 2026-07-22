"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PricesMeta } from "../types";
import { useCurrency, DISPLAY_CURRENCIES } from "./CurrencyProvider";
import { metaToExchangeRates } from "../lib/exchange-rates";

const CURRENCY_LABELS: Record<(typeof DISPLAY_CURRENCIES)[number], string> = {
  USD: "US Dollar (USD)",
  EUR: "Euro (EUR)",
  HUF: "Hungarian Forint (HUF)",
  GBP: "British Pound (GBP)",
};

export function SettingsPanel() {
  const { currency, setCurrency } = useCurrency();
  const [meta, setMeta] = useState<PricesMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMeta() {
      try {
        const res = await fetch("/api/collection", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { prices?: { meta: PricesMeta } };
        setMeta(data.prices?.meta ?? null);
      } catch {
        setMetaError("Could not load exchange rate info.");
      }
    }
    void loadMeta();
  }, []);

  const rates = meta ? metaToExchangeRates(meta) : null;

  return (
    <section className="panel-card panel-card-padded">
      <div className="settings-toolbar">
        <Link href="/checklist" className="secondary-button">
          Back to checklist
        </Link>
      </div>

      <div className="page-kicker">Preferences</div>
      <h1 className="page-title">Display currency</h1>
      <p className="page-copy">
        Choose one currency for card prices and estimated collection value. Native
        marketplace prices are used when available (USD from TCGPlayer, EUR from
        Cardmarket); otherwise values are converted using current exchange rates.
      </p>

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

      {metaError && <p className="page-copy is-error">{metaError}</p>}
      {rates && (
        <p className="page-copy page-copy-muted">
          Exchange rates as of {rates.ratesUpdatedAt}. EUR/USD:{" "}
          {rates.eurUsdRate.toFixed(4)} (1 EUR = {rates.eurUsdRate.toFixed(4)} USD).
        </p>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PricesMeta } from "../types";
import { DisplayCurrencyPicker } from "./DisplayCurrencyPicker";
import { metaToExchangeRates } from "../lib/exchange-rates";

export function SettingsPanel() {
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

      <DisplayCurrencyPicker variant="fieldset" />

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

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { DisplayCurrency } from "../types";
import { DISPLAY_CURRENCIES } from "../lib/exchange-rates";

const STORAGE_KEY = "eevee-tracker-display-currency";

interface CurrencyContextValue {
  currency: DisplayCurrency;
  setCurrency: (currency: DisplayCurrency) => void;
  hydrated: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function readStoredCurrency(): DisplayCurrency {
  if (typeof window === "undefined") return "USD";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && DISPLAY_CURRENCIES.includes(stored as DisplayCurrency)) {
    return stored as DisplayCurrency;
  }
  return "USD";
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>("USD");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCurrencyState(readStoredCurrency());
    setHydrated(true);
  }, []);

  const setCurrency = useCallback((next: DisplayCurrency) => {
    setCurrencyState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, hydrated }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error("useCurrency must be used within CurrencyProvider");
  }
  return ctx;
}

export { DISPLAY_CURRENCIES, STORAGE_KEY };

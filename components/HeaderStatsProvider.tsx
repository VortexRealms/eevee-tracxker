"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DisplayCurrency } from "../types";

export interface PublishedHeaderStats {
  percent: number;
  estimatedValue: number;
  currency: DisplayCurrency;
  panelVisible: boolean;
}

interface HeaderStatsContextValue {
  stats: PublishedHeaderStats | null;
  publish: (stats: PublishedHeaderStats) => void;
  clear: () => void;
}

const HeaderStatsContext = createContext<HeaderStatsContextValue | null>(null);

export function HeaderStatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<PublishedHeaderStats | null>(null);
  const publish = useCallback((next: PublishedHeaderStats) => setStats(next), []);
  const clear = useCallback(() => setStats(null), []);
  const value = useMemo(
    () => ({ stats, publish, clear }),
    [stats, publish, clear]
  );

  return (
    <HeaderStatsContext.Provider value={value}>{children}</HeaderStatsContext.Provider>
  );
}

export function useHeaderStats(): HeaderStatsContextValue {
  const ctx = useContext(HeaderStatsContext);
  if (!ctx) {
    throw new Error("useHeaderStats must be used within HeaderStatsProvider");
  }
  return ctx;
}

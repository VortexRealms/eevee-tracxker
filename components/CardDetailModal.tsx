"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CollectionRow, PokemonCard, PricesSnapshot } from "../types";
import { defaultPriceVariant, parseCardIdAndVariant } from "../lib/cards";
import { getVariantLabel, variantSortIndex } from "../lib/variant-labels";
import { metaToExchangeRates } from "../lib/exchange-rates";
import { formatDisplayPrice, resolveDisplayAmount } from "../lib/display-price";
import {
  getCardmarketSearchUrl,
  getEbaySearchUrl,
  getTcgPlayerSearchUrl,
} from "../lib/marketplace-search";
import { useCurrency } from "./CurrencyProvider";
import styles from "./CardDetailModal.module.css";

interface CardDetailModalProps {
  card: PokemonCard | null;
  prices: PricesSnapshot | null;
  collection: CollectionRow[];
  onClose: () => void;
}

interface HistoryPoint {
  date: string;
  usd: number | null;
  eur: number | null;
}

interface ChartPoint {
  date: string;
  amount: number | null;
}

function findOwnedVariant(card: PokemonCard, collection: CollectionRow[]): string | null {
  for (const row of collection) {
    if (!row.owned) continue;
    const { cardId, variant } = parseCardIdAndVariant(row.cardId);
    if (cardId === card.id) return row.variant ?? variant;
  }
  return null;
}

function formatAxisDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function CustomTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | null; payload?: ChartPoint }>;
  currency: Parameters<typeof formatDisplayPrice>[1];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point || point.amount == null) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{formatAxisDate(point.date)}</div>
      <div className={styles.tooltipValue}>{formatDisplayPrice(point.amount, currency)}</div>
    </div>
  );
}

export function CardDetailModal({ card, prices, collection, onClose }: CardDetailModalProps) {
  const { currency } = useCurrency();
  const [mounted, setMounted] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, HistoryPoint[]>>(new Map());

  useEffect(() => {
    setMounted(true);
  }, []);

  const rates = useMemo(
    () => metaToExchangeRates(prices?.meta ?? { ratesUpdatedAt: "" }),
    [prices]
  );

  const variants = useMemo(() => {
    const list = card?.variants?.length ? card.variants : ["normal"];
    return list.slice().sort((a, b) => variantSortIndex(a) - variantSortIndex(b));
  }, [card]);

  useEffect(() => {
    if (!card) {
      setSelectedVariant(null);
      return;
    }
    cacheRef.current = new Map();
    const owned = findOwnedVariant(card, collection);
    const initial = owned && variants.includes(owned) ? owned : defaultPriceVariant(card);
    setSelectedVariant(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card]);

  useEffect(() => {
    if (!card) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [card, onClose]);

  useEffect(() => {
    if (!card || !selectedVariant) return;

    const cacheKey = `${card.id}:${selectedVariant}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPoints(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/price-history?cardId=${encodeURIComponent(card.id)}&variant=${encodeURIComponent(selectedVariant)}&days=30`,
      { credentials: "include" }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ points: HistoryPoint[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        const series = data.points ?? [];
        cacheRef.current.set(cacheKey, series);
        setPoints(series);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setPoints([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [card, selectedVariant]);

  if (!mounted || !card) return null;

  const chartData: ChartPoint[] = points.map((p) => ({
    date: p.date,
    amount: resolveDisplayAmount({ usd: p.usd, eur: p.eur }, currency, rates).amount,
  }));
  const usable = chartData.filter(
    (p): p is { date: string; amount: number } => p.amount != null
  );

  const currentAmount = usable.length ? usable[usable.length - 1].amount : null;
  const lowAmount = usable.length ? Math.min(...usable.map((p) => p.amount)) : null;
  const changePercent =
    usable.length >= 2 && usable[0].amount !== 0
      ? ((usable[usable.length - 1].amount - usable[0].amount) / usable[0].amount) * 100
      : null;

  const changeLabel =
    changePercent == null
      ? "N/A"
      : `${changePercent > 0 ? "+" : ""}${changePercent.toFixed(2)}%`;
  const changeClass =
    changePercent == null
      ? ""
      : changePercent > 0
        ? styles.changePositive
        : changePercent < 0
          ? styles.changeNegative
          : "";

  return createPortal(
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Close"
        onClick={onClose}
      />
      <div className={styles.sheet} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Card Details</h2>
          <button type="button" onClick={onClose} className={styles.close} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.media}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.images.large || card.images.small}
              alt={card.name}
              className={styles.image}
            />
          </div>

          <div className={styles.rightColumn}>
            <h3 className={styles.name}>{card.name}</h3>
            <p className={styles.meta}>
              {card.set.name} · #{card.number}
              {card.rarity ? ` · ${card.rarity}` : ""}
            </p>

            <div className={styles.statsRow}>
              <div className={styles.statBox}>
                <span className={styles.statLabel}>Current Price</span>
                <span className={styles.statValue}>
                  {formatDisplayPrice(currentAmount, currency)}
                </span>
              </div>
              <div className={styles.statBox}>
                <span className={styles.statLabel}>30D Low</span>
                <span className={styles.statValue}>
                  {formatDisplayPrice(lowAmount, currency)}
                </span>
              </div>
              <div className={styles.statBox}>
                <span className={styles.statLabel}>30D Change</span>
                <span className={`${styles.statValue} ${changeClass}`}>{changeLabel}</span>
              </div>
            </div>

            <div className={styles.variantTabs}>
              {variants.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  className={`${styles.variantTab} ${
                    variant === selectedVariant ? styles.variantTabActive : ""
                  }`}
                  onClick={() => setSelectedVariant(variant)}
                >
                  {getVariantLabel(variant)}
                </button>
              ))}
            </div>

            <div className={styles.chartSection}>
              {loading ? (
                <div className={styles.chartEmpty}>Loading price history…</div>
              ) : points.length === 0 ? (
                <div className={styles.chartEmpty}>No price history yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="rgba(255, 236, 214, 0.08)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatAxisDate}
                      stroke="rgba(255, 236, 214, 0.35)"
                      tick={{ fill: "#9f8677", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tickFormatter={(value: number) => formatDisplayPrice(value, currency)}
                      stroke="rgba(255, 236, 214, 0.35)"
                      tick={{ fill: "#9f8677", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={72}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip content={<CustomTooltip currency={currency} />} />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#fbbf24"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                      activeDot={{ r: 4, fill: "#fbbf24" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className={styles.marketplaceRow}>
          <a
            href={getEbaySearchUrl(card)}
            target="_blank"
            rel="noopener noreferrer"
            className={`secondary-button ${styles.marketplaceButton}`}
          >
            eBay
          </a>
          <a
            href={getTcgPlayerSearchUrl(card)}
            target="_blank"
            rel="noopener noreferrer"
            className={`secondary-button ${styles.marketplaceButton}`}
          >
            TCGplayer
          </a>
          <a
            href={getCardmarketSearchUrl(card)}
            target="_blank"
            rel="noopener noreferrer"
            className={`secondary-button ${styles.marketplaceButton}`}
          >
            Cardmarket
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}

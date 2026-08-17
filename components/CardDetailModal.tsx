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
import type { DisplayCurrency, PokemonCard, PricesSnapshot } from "../types";
import { metaToExchangeRates } from "../lib/exchange-rates";
import { formatDisplayPrice, resolveDisplayAmount } from "../lib/display-price";
import { getPriceForCard } from "../lib/cards";
import { getVariantLabel } from "../lib/variant-labels";
import { formatCameoLabel } from "../lib/cameo-catalogue";
import {
  getCardmarketSearchUrl,
  getEbaySearchUrl,
  getTcgPlayerSearchUrl,
} from "../lib/marketplace-search";
import { useCurrency } from "./CurrencyProvider";
import styles from "./CardDetailModal.module.css";

interface CardDetailModalProps {
  card: PokemonCard | null;
  variant: string | null;
  prices: PricesSnapshot | null;
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

function formatAxisDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function formatCompactChartPrice(value: number, currency: DisplayCurrency): string {
  const abs = Math.abs(value);
  if (currency === "HUF") {
    if (abs >= 1000) {
      const k = value / 1000;
      return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
    }
    return String(Math.round(value));
  }
  const symbols: Record<Exclude<DisplayCurrency, "HUF">, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
  };
  const sym = symbols[currency as Exclude<DisplayCurrency, "HUF">];
  if (abs >= 1000) {
    const k = value / 1000;
    return `${sym}${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
  }
  if (abs >= 100) return `${sym}${Math.round(value)}`;
  return `${sym}${Math.round(value)}`;
}

function useIsMobileLayout(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 599px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
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

export function CardDetailModal({ card, variant, prices, onClose }: CardDetailModalProps) {
  const { currency } = useCurrency();
  const isMobileLayout = useIsMobileLayout();
  const [mounted, setMounted] = useState(false);
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageExpanded, setImageExpanded] = useState(false);
  const imageExpandedRef = useRef(false);
  const cacheRef = useRef<Map<string, HistoryPoint[]>>(new Map());

  useEffect(() => {
    imageExpandedRef.current = imageExpanded;
  }, [imageExpanded]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rates = useMemo(
    () => metaToExchangeRates(prices?.meta ?? { ratesUpdatedAt: "" }),
    [prices]
  );

  useEffect(() => {
    if (!card) {
      setImageExpanded(false);
      setPoints([]);
      return;
    }
    cacheRef.current = new Map();
  }, [card, variant]);

  useEffect(() => {
    if (!card) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (imageExpandedRef.current) {
        setImageExpanded(false);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [card, onClose]);

  useEffect(() => {
    if (!card || !variant) return;

    const cacheKey = `${card.id}:${variant}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setPoints(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/price-history?cardId=${encodeURIComponent(card.id)}&variant=${encodeURIComponent(variant)}&days=30`,
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
  }, [card, variant]);

  if (!mounted || !card || !variant) return null;

  const chartData: ChartPoint[] = points.map((p) => ({
    date: p.date,
    amount: resolveDisplayAmount({ usd: p.usd, eur: p.eur }, currency, rates).amount,
  }));
  const usable = chartData.filter(
    (p): p is { date: string; amount: number } => p.amount != null
  );

  const livePrice = card && variant ? getPriceForCard(card, variant, prices) : null;
  const liveDisplay =
    livePrice != null
      ? resolveDisplayAmount(livePrice, currency, rates)
      : { amount: null as number | null, source: null };

  const currentAmount =
    liveDisplay.amount ??
    (usable.length ? usable[usable.length - 1].amount : null);
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

  const variantLabel = getVariantLabel(variant);
  const cameoLabel = formatCameoLabel(card.cameoOf);

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

        <div className={styles.scrollBody}>
          <div className={styles.body}>
            <div className={styles.media}>
              <button
                type="button"
                className={styles.mediaButton}
                onClick={() => setImageExpanded(true)}
                aria-label={`View ${card.name} full size`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.images.large || card.images.small}
                  alt={card.name}
                  className={styles.image}
                />
              </button>
            </div>

            <div className={styles.rightColumn}>
              <div className={styles.identityBlock}>
                <h3 className={styles.name}>{card.name}</h3>
                <p className={styles.meta}>
                  {card.set.name} · #{card.number}
                  {card.rarity ? ` · ${card.rarity}` : ""}
                </p>
                {cameoLabel ? (
                  <p className={styles.meta}>Cameo: {cameoLabel}</p>
                ) : null}
              </div>

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

              <div className={styles.priceSummary}>
                <div className={styles.priceSummaryMain}>
                  <span className={styles.priceSummaryVariant}>{variantLabel}</span>
                  <span className={styles.priceSummaryValue}>
                    {formatDisplayPrice(currentAmount, currency)}
                  </span>
                  <span className={`${styles.priceSummaryChange} ${changeClass}`}>
                    {changeLabel}
                  </span>
                </div>
                <p className={styles.priceSummarySecondary}>
                  30D low: {formatDisplayPrice(lowAmount, currency)}
                </p>
              </div>

              <div className={styles.chartBlock}>
                <div className={styles.chartHeader}>
                  <h4 className={styles.chartTitle}>Price history</h4>
                  <span className={styles.chartSeriesLabel}>{variantLabel}</span>
                </div>
                <div className={styles.chartSection}>
                  {loading ? (
                    <div className={styles.chartEmpty}>Loading price history…</div>
                  ) : points.length === 0 ? (
                    <div className={styles.chartEmpty}>No price history yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={
                          isMobileLayout
                            ? { top: 8, right: 8, bottom: 8, left: 4 }
                            : { top: 8, right: 16, bottom: 0, left: 0 }
                        }
                      >
                        <CartesianGrid stroke="rgba(255, 236, 214, 0.08)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={formatAxisDate}
                          stroke="rgba(255, 236, 214, 0.35)"
                          tick={{ fill: "#9f8677", fontSize: isMobileLayout ? 10 : 11 }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={isMobileLayout ? 20 : 24}
                        />
                        <YAxis
                          tickFormatter={(value: number) =>
                            isMobileLayout
                              ? formatCompactChartPrice(value, currency)
                              : formatDisplayPrice(value, currency)
                          }
                          stroke="rgba(255, 236, 214, 0.35)"
                          tick={{ fill: "#9f8677", fontSize: isMobileLayout ? 10 : 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={isMobileLayout ? 48 : 72}
                          domain={[0, "auto"]}
                          allowDecimals={false}
                          tickCount={5}
                        />
                        <Tooltip content={<CustomTooltip currency={currency} />} />
                        <Line
                          type="monotone"
                          dataKey="amount"
                          stroke="#fbbf24"
                          strokeWidth={isMobileLayout ? 2 : 2.5}
                          dot={false}
                          connectNulls={false}
                          activeDot={{ r: 4, fill: "#fbbf24" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
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
          </div>
        </div>
      </div>

      {imageExpanded ? (
        <div
          className={styles.imageLightbox}
          role="dialog"
          aria-modal="true"
          aria-label={`${card.name} full size`}
        >
          <button
            type="button"
            className={styles.imageLightboxDismiss}
            aria-label="Close image"
            onClick={() => setImageExpanded(false)}
          />
          <button
            type="button"
            className={styles.imageLightboxClose}
            aria-label="Close image"
            onClick={() => setImageExpanded(false)}
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.images.large || card.images.small}
            alt={card.name}
            className={styles.imageLightboxImg}
          />
        </div>
      ) : null}
    </div>,
    document.body
  );
}

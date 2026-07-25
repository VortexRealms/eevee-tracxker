"use client";

import { useId, useMemo } from "react";
import { formatDisplayPrice } from "../../lib/display-price";
import type { DisplayCurrency } from "../../types";
import styles from "./CollectionStatsPanel.module.css";

export interface CollectionStatsPanelProps {
  ownedVariants: number;
  totalVariants: number;
  missingVariants: number;
  uniqueCards: number;
  setCount: number;
  estimatedValue: number;
  currency?: DisplayCurrency;
  updatedLabel?: string;
}

const TICK_MARKS = [25, 50, 75, 100] as const;

const RING_SIZE = 180;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function clampPercent(owned: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (owned / total) * 100));
}

function formatPercent(owned: number, total: number): string {
  return `${clampPercent(owned, total).toFixed(1)}%`;
}

export function CollectionStatsPanel({
  ownedVariants,
  totalVariants,
  missingVariants,
  uniqueCards,
  setCount,
  estimatedValue,
  currency = "USD",
  updatedLabel = "updated just now",
}: CollectionStatsPanelProps) {
  const id = useId().replace(/:/g, "");
  const gradientId = `stats-ring-gradient-${id}`;
  const glowId = `stats-ring-glow-${id}`;
  const percent = useMemo(
    () => clampPercent(ownedVariants, totalVariants),
    [ownedVariants, totalVariants]
  );

  const ringOffset = useMemo(
    () => RING_CIRCUMFERENCE * (1 - percent / 100),
    [percent]
  );

  const formattedValue = formatDisplayPrice(estimatedValue, currency);

  return (
    <section className={styles.panel} aria-label="Collection statistics">
      <header className={styles.header}>
        <p className={styles.eyebrow}>My collection</p>
        <p className={styles.updated}>{updatedLabel}</p>
      </header>

      <div className={styles.content}>
        <div className={styles.ringColumn}>
          <div className={styles.ringWrap}>
            <svg
              viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
              className={styles.ringSvg}
              role="img"
              aria-label={`${formatPercent(ownedVariants, totalVariants)} owned`}
            >
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a7ef8a" />
                  <stop offset="52%" stopColor="#43c66b" />
                  <stop offset="100%" stopColor="#1f8f54" />
                </linearGradient>
                <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,236,214,0.08)"
                strokeWidth={RING_STROKE}
              />
              <circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                filter={`url(#${glowId})`}
                className={styles.ringProgress}
              />
            </svg>
            <div className={styles.ringCopy}>
              <span className={styles.ringPercent}>
                {formatPercent(ownedVariants, totalVariants)}
              </span>
              <span className={styles.ringLabel}>Owned</span>
            </div>
          </div>
        </div>

        <div className={styles.middle}>
          <h2 className={styles.headline}>
            {ownedVariants.toLocaleString()} of {totalVariants.toLocaleString()} cards
          </h2>

          <div className={styles.barArea}>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className={styles.ticks}>
              {TICK_MARKS.map((tick) => (
                <div
                  key={tick}
                  className={styles.tick}
                  style={{ left: `${tick}%` }}
                >
                  <span className={styles.tickLine} />
                  <span className={styles.tickLabel}>{tick}%</span>
                </div>
              ))}
            </div>
          </div>

          <p className={styles.missing}>
            {missingVariants.toLocaleString()} still to find
          </p>
          <p className={styles.details}>
            {uniqueCards.toLocaleString()} unique cards · {setCount.toLocaleString()} sets
          </p>
        </div>

        <div className={styles.valueColumn}>
          <p className={styles.valueLabel}>Est. value</p>
          <p className={styles.value}>{formattedValue}</p>
        </div>
      </div>
    </section>
  );
}

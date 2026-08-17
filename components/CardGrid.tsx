"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CollectionRow, PokemonCard, PricesSnapshot } from "../types";
import {
  getCardmarketSearchUrl,
  getEbaySearchUrl,
  getTcgPlayerSearchUrl,
} from "../lib/marketplace-search";
import { getPriceForCard, parseCardIdAndVariant } from "../lib/cards";
import {
  buildSortedCatalogueSlots,
  isSlotOwned,
  type VariantSlot,
} from "../lib/catalogue-slots";
import { metaToExchangeRates } from "../lib/exchange-rates";
import { resolveDisplayAmount } from "../lib/display-price";
import { getVariantLabel } from "../lib/variant-labels";
import { formatCameoLabel } from "../lib/cameo-catalogue";
import { useCurrency } from "./CurrencyProvider";
import { CardPriceLabel } from "./CardPriceLabel";
import { CollectionStatsPanel } from "./dashboard/CollectionStatsPanel";
import { DisplayCurrencyPicker } from "./DisplayCurrencyPicker";
import { useHeaderStats } from "./HeaderStatsProvider";
import { CardGridSkeletons } from "./ChecklistLoading";

export type CardGridMode = "checklist" | "public";

interface CardGridProps {
  cards: PokemonCard[];
  collection: CollectionRow[];
  prices: PricesSnapshot | null;
  onCardClick: (cardId: string, variant: string) => void;
  onSetOwned: (cardId: string, variant: string, owned: boolean) => void;
  isLoading: boolean;
  animateStats?: boolean;
  updatingCardId: string | null;
  /** Public showcase: owned-only grid, no marketplace links, no add/remove. */
  mode?: CardGridMode;
}

type FilterValue = "all" | "owned" | "missing";

function getAccentClass(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("vaporeon")) return "is-vaporeon";
  if (lower.includes("jolteon")) return "is-jolteon";
  if (lower.includes("flareon")) return "is-flareon";
  if (lower.includes("espeon")) return "is-espeon";
  if (lower.includes("umbreon")) return "is-umbreon";
  if (lower.includes("leafeon")) return "is-leafeon";
  if (lower.includes("glaceon")) return "is-glaceon";
  if (lower.includes("sylveon")) return "is-sylveon";
  return "is-eevee";
}

interface CardTileProps {
  card: PokemonCard;
  variantLabel?: string;
  status: "owned" | "missing" | null;
  priceNode?: ReactNode;
  onOpen: () => void;
  isPublic: boolean;
  marketplaceLinks: ReactNode;
  actionNode?: ReactNode;
  showDesktopMeta?: boolean;
  desktopMeta?: ReactNode;
}

function CardTile({
  card,
  variantLabel,
  status,
  priceNode,
  onOpen,
  isPublic,
  marketplaceLinks,
  actionNode,
  showDesktopMeta = true,
  desktopMeta,
}: CardTileProps) {
  const detailLineThree = variantLabel
    ? variantLabel
    : card.rarity
      ? card.rarity
      : null;
  const cameoLine = card.cameoOf?.length
    ? `Cameo: ${formatCameoLabel(card.cameoOf)}`
    : null;

  return (
    <div className={`card-tile ${getAccentClass(card.name)}`}>
      <button type="button" className="card-open-region" onClick={onOpen}>
        <div className="card-media-button">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.images.small}
            alt={card.name}
            className="card-image"
            loading="lazy"
            decoding="async"
          />
          {status === "owned" ? (
            <span className="status-pill status-pill-owned">Owned</span>
          ) : null}
          {status === "missing" ? (
            <span className="status-pill status-pill-missing">Missing</span>
          ) : null}
        </div>
        <div className="card-body">
          <div className="card-header-row">
            <div className="card-info-block">
              <div className="card-title">{card.name}</div>
            </div>
            {priceNode ? <div className="card-price-desktop">{priceNode}</div> : null}
          </div>
          <div className="card-detail-lines">
            <span className="card-detail-line">{card.set.name}</span>
            <span className="card-detail-line">
              {card.set.series} · #{card.number}
            </span>
            {detailLineThree ? (
              <span className="card-detail-line">{detailLineThree}</span>
            ) : null}
            {cameoLine ? (
              <span className="card-detail-line">{cameoLine}</span>
            ) : null}
          </div>
          <div className="card-subtitle-row card-subtitle-desktop">
            <span className="card-setname">{card.set.name}</span>
            <span className="card-number">#{card.number}</span>
          </div>
          {showDesktopMeta && desktopMeta ? (
            <div className="card-meta-row card-meta-desktop">{desktopMeta}</div>
          ) : null}
          {priceNode ? <div className="card-footer-row">{priceNode}</div> : null}
        </div>
      </button>
      {!isPublic && actionNode ? (
        <div className="card-action-wrap">
          <div className="search-buttons-row card-marketplace-links">{marketplaceLinks}</div>
          {actionNode}
        </div>
      ) : null}
    </div>
  );
}

function MarketplaceLinks({ card }: { card: PokemonCard }) {
  return (
    <>
      <a
        href={getEbaySearchUrl(card)}
        target="_blank"
        rel="noopener noreferrer"
        className="secondary-button search-button"
      >
        eBay
      </a>
      <a
        href={getTcgPlayerSearchUrl(card)}
        target="_blank"
        rel="noopener noreferrer"
        className="secondary-button search-button"
      >
        TCGplayer
      </a>
      <a
        href={getCardmarketSearchUrl(card)}
        target="_blank"
        rel="noopener noreferrer"
        className="secondary-button search-button"
      >
        Cardmarket
      </a>
    </>
  );
}

function slotHaystack(slot: VariantSlot): string {
  const { card, variant } = slot;
  const cameo = card.cameoOf?.join(" ") ?? "";
  return [
    card.name,
    card.set.name,
    card.set.series,
    card.number,
    variant,
    getVariantLabel(variant),
    cameo,
  ]
    .join(" ")
    .toLowerCase();
}

export function CardGrid({
  cards,
  collection,
  prices,
  onCardClick,
  onSetOwned,
  isLoading,
  animateStats = true,
  updatingCardId,
  mode = "checklist",
}: CardGridProps) {
  const isPublic = mode === "public";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>(() =>
    isPublic ? "owned" : "all"
  );
  const panelRef = useRef<HTMLElement>(null);
  const [panelVisible, setPanelVisible] = useState(true);
  const { publish, clear } = useHeaderStats();

  const { currency, hydrated: currencyHydrated } = useCurrency();
  const exchangeRates = useMemo(
    () => (prices?.meta ? metaToExchangeRates(prices.meta) : null),
    [prices?.meta]
  );
  const showPrices = exchangeRates !== null;

  const catalogueSlots = useMemo(() => buildSortedCatalogueSlots(cards), [cards]);
  const totalVariants = catalogueSlots.length;
  const validSlotKeys = useMemo(
    () => new Set(catalogueSlots.map((slot) => slot.slotKey)),
    [catalogueSlots]
  );

  const ownedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of collection) {
      if (!row.owned) continue;
      const { cardId, variant } = parseCardIdAndVariant(row.cardId);
      keys.add(`${cardId}:${variant}`);
    }
    return keys;
  }, [collection]);

  const counts = useMemo(() => {
    let collectionValue = 0;
    const ownedVariantKeys = new Set<string>();

    for (const row of collection) {
      if (!row.owned) continue;
      const { cardId, variant } = parseCardIdAndVariant(row.cardId);

      const key = `${cardId}:${variant}`;
      if (!validSlotKeys.has(key)) continue;
      if (ownedVariantKeys.has(key)) continue;
      ownedVariantKeys.add(key);

      const card = cards.find((c) => c.id === cardId);
      if (card && exchangeRates) {
        const price = getPriceForCard(card, variant, prices);
        const { amount } = resolveDisplayAmount(price, currency, exchangeRates);
        if (amount != null) collectionValue += amount;
      }
    }

    return {
      owned: ownedVariantKeys.size,
      collectionValue,
    };
  }, [cards, collection, currency, exchangeRates, prices, validSlotKeys]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPanelVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setPanelVisible(entry.isIntersecting),
      { root: null, rootMargin: "-88px 0px 0px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ownedPercent = useMemo(() => {
    if (totalVariants <= 0) return 0;
    return Math.min(100, Math.max(0, (counts.owned / totalVariants) * 100));
  }, [counts.owned, totalVariants]);

  useEffect(() => {
    publish({
      percent: ownedPercent,
      estimatedValue: counts.collectionValue,
      currency,
      panelVisible,
    });
  }, [ownedPercent, counts.collectionValue, currency, panelVisible, publish]);

  useEffect(() => () => clear(), [clear]);

  const searchTokens = useMemo(
    () =>
      search
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter(Boolean),
    [search]
  );

  const filteredSlots = useMemo(() => {
    return catalogueSlots.filter((slot) => {
      const owned = isSlotOwned(slot.slotKey, ownedKeys);

      if (isPublic && !owned) return false;
      if (!isPublic && filter === "owned" && !owned) return false;
      if (!isPublic && filter === "missing" && owned) return false;

      if (searchTokens.length === 0) return true;
      const haystack = slotHaystack(slot);
      return searchTokens.every((token) => haystack.includes(token));
    });
  }, [catalogueSlots, ownedKeys, filter, isPublic, searchTokens]);

  function renderSlotTile(slot: VariantSlot) {
    const { card, variant, slotKey } = slot;
    const owned = isSlotOwned(slotKey, ownedKeys);
    const isUpdating = updatingCardId === slotKey;

    return (
      <CardTile
        card={card}
        variantLabel={getVariantLabel(variant)}
        status={owned ? "owned" : "missing"}
        onOpen={() => onCardClick(card.id, variant)}
        isPublic={isPublic}
        marketplaceLinks={<MarketplaceLinks card={card} />}
        priceNode={
          showPrices && exchangeRates ? (
            (() => {
              const resolved = getPriceForCard(card, variant, prices);
              return (
                <CardPriceLabel
                  price={resolved}
                  currency={currency}
                  rates={exchangeRates}
                  updatedAt={resolved.updatedAt}
                  priceSource={resolved.source}
                  priceKind={resolved.priceKind}
                  sampleCount={resolved.sampleCount}
                />
              );
            })()
          ) : null
        }
        desktopMeta={
          <>
            <span className="set-pill">{card.set.series}</span>
            <span className="variant-capsule">{getVariantLabel(variant)}</span>
            <span className="mini-pill">{card.set.releaseDate}</span>
          </>
        }
        actionNode={
          isPublic ? undefined : owned ? (
            <button
              type="button"
              onClick={() => onSetOwned(card.id, variant, false)}
              className="card-action secondary-button danger-button"
              disabled={isUpdating}
            >
              {isUpdating ? "Saving..." : "Remove from collection"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSetOwned(card.id, variant, true)}
              className="card-action primary-button"
              disabled={isUpdating}
            >
              {isUpdating ? "Saving..." : "Add to collection"}
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="collection-layout">
      <div className="sticky-toolbar">
        <CollectionStatsPanel
          ref={panelRef}
          ownedVariants={counts.owned}
          totalVariants={totalVariants}
          estimatedValue={counts.collectionValue}
          currency={currencyHydrated ? currency : "USD"}
          animate={animateStats}
        />

        <div className="search-shell">
          <span className="search-icon">⌕</span>
          <input
            type="search"
            placeholder="Search card, set, or number"
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isPublic && <DisplayCurrencyPicker variant="chips" />}

        {!isPublic && (
          <div className="chip-row chip-row-scroll">
            {(
              [
                ["all", "All"],
                ["owned", "Owned"],
                ["missing", "Missing"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip ${filter === value ? "is-active" : ""}`}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div aria-busy="true" aria-labelledby="card-grid-loading-status">
          <p id="card-grid-loading-status" className="sr-only" aria-live="polite">
            Loading collection
          </p>
          <CardGridSkeletons />
        </div>
      ) : filteredSlots.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-orb" />
          <h2>No matching cards</h2>
          <p>Try a different search, or switch back to the full collection view.</p>
        </div>
      ) : (
        <div className="collection-grid">
          {filteredSlots.map((slot) => (
            <div key={slot.slotKey}>{renderSlotTile(slot)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

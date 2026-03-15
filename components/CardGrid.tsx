import { useMemo, useState } from "react";
import type { CollectionRow, PokemonCard } from "../types";
import { getEurUsdRate, getPriceForCard, parseCardIdAndVariant } from "../lib/cards";
import { VariantPickerModal } from "./VariantPickerModal";

const VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  reverse: "Reverse Holofoil",
  holo: "Holofoil",
  firstEdition: "1st Edition",
  wPromo: "W Promo"
};

const VARIANT_SORT_ORDER = ["normal", "reverse", "holo", "firstEdition", "wPromo"];

function getVariantLabel(variant: string): string {
  return VARIANT_LABELS[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1);
}

interface CardGridProps {
  cards: PokemonCard[];
  collection: CollectionRow[];
  onCardClick: (cardId: string) => void;
  onSetOwned: (cardId: string, variant: string, owned: boolean) => void;
  isLoading: boolean;
  updatingCardId: string | null;
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

function getEbaySearchUrl(card: PokemonCard): string {
  const query = [card.name, card.set.name, card.set.series, card.number].join(" ");
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
}

function getTcgPlayerSearchUrl(card: PokemonCard): string {
  const query = [card.name, card.number, card.set.name].join(" ");
  return `https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=${encodeURIComponent(query)}`;
}

function getCardmarketSearchUrl(card: PokemonCard): string {
  const paddedNumber = /^\d+$/.test(card.number)
    ? card.number.padStart(3, "0")
    : card.number;
  const query = `${card.name} ${paddedNumber}`;
  return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchMode=v2&idCategory=0&searchString=${encodeURIComponent(query)}&idRarity=0`;
}

export function CardGrid({
  cards,
  collection,
  onCardClick,
  onSetOwned,
  isLoading,
  updatingCardId
}: CardGridProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [variantPickerCard, setVariantPickerCard] = useState<PokemonCard | null>(null);

  const eurUsdRate = getEurUsdRate();

  const hasAnyOwnedVariant = useMemo(() => {
    const set = new Set<string>();
    for (const row of collection) {
      if (!row.owned) continue;
      const { cardId } = parseCardIdAndVariant(row.cardId);
      set.add(cardId);
    }
    return (cardId: string) => set.has(cardId);
  }, [collection]);

  const ownedEntries = useMemo(() => {
    const entries = collection
      .filter((row) => row.owned)
      .map((row) => {
        const { cardId, variant } = parseCardIdAndVariant(row.cardId);
        const card = cards.find((c) => c.id === cardId);
        return card ? { card, variant, row } : null;
      })
      .filter((x): x is { card: PokemonCard; variant: string; row: CollectionRow } => x != null);

    const cardIndexMap = new Map(cards.map((c, i) => [c.id, i]));
    return [...entries].sort((a, b) => {
      const idxA = cardIndexMap.get(a.card.id) ?? 9999;
      const idxB = cardIndexMap.get(b.card.id) ?? 9999;
      if (idxA !== idxB) return idxA - idxB;
      const vA = VARIANT_SORT_ORDER.indexOf(a.variant);
      const vB = VARIANT_SORT_ORDER.indexOf(b.variant);
      return (vA >= 0 ? vA : 999) - (vB >= 0 ? vB : 999);
    });
  }, [collection, cards]);

  const counts = useMemo(() => {
    let collectionValue = 0;
    const ownedCardIds = new Set<string>();
    for (const row of collection) {
      if (!row.owned) continue;
      const { cardId, variant } = parseCardIdAndVariant(row.cardId);
      ownedCardIds.add(cardId);
      const card = cards.find((c) => c.id === cardId);
      if (card) {
        const price = getPriceForCard(card, variant);
        const usd =
          price.usd != null ? price.usd : price.eur != null ? price.eur * eurUsdRate : null;
        if (usd != null) collectionValue += usd;
      }
    }
    const owned = ownedCardIds.size;
    const missing = cards.filter((c) => !ownedCardIds.has(c.id)).length;
    return { owned, missing, collectionValue };
  }, [cards, collection, eurUsdRate]);

  const searchTokens = useMemo(
    () =>
      search
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter(Boolean),
    [search]
  );

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const owned = hasAnyOwnedVariant(card.id);

      if (filter === "owned" && !owned) return false;
      if (filter === "missing" && owned) return false;
      if (searchTokens.length === 0) return true;

      const haystack = [
        card.name,
        card.set.name,
        card.set.series,
        card.number
      ]
        .join(" ")
        .toLowerCase();

      return searchTokens.every((token) => haystack.includes(token));
    });
  }, [cards, hasAnyOwnedVariant, filter, searchTokens]);

  const filteredOwned = useMemo(() => {
    return ownedEntries.filter(({ card }) => {
      if (searchTokens.length === 0) return true;
      const haystack = [
        card.name,
        card.set.name,
        card.set.series,
        card.number
      ]
        .join(" ")
        .toLowerCase();
      return searchTokens.every((token) => haystack.includes(token));
    });
  }, [ownedEntries, searchTokens]);

  return (
    <div className="collection-layout">
      <div className="sticky-toolbar">
        <div className="hero-panel">
          <div className="page-kicker">Checklist</div>
          <div className="stats-row">
            <div className="stat-pill">
              <span>{cards.length}</span>
              <small>total</small>
            </div>
            <div className="stat-pill is-missing">
              <span>{counts.missing}</span>
              <small>missing</small>
            </div>
            <div className="stat-pill is-owned">
              <span>{counts.owned}</span>
              <small>owned</small>
            </div>
            <div className="stat-pill is-value">
              <span>${counts.collectionValue.toFixed(2)}</span>
              <small>est. value</small>
            </div>
          </div>
        </div>

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

        <div className="chip-row chip-row-scroll">
          {([
            ["all", "All"],
            ["owned", "Owned"],
            ["missing", "Missing"]
          ] as const).map(([value, label]) => (
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
      </div>

      {isLoading ? (
        <div className="collection-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card-tile card-skeleton">
              <div className="card-skeleton-media shimmer" />
              <div className="card-skeleton-lines">
                <div className="shimmer" />
                <div className="shimmer short" />
              </div>
            </div>
          ))}
        </div>
      ) : (filter === "owned" ? filteredOwned : filteredCards).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-orb" />
          <h2>No matching cards</h2>
          <p>Try a different search, or switch back to the full collection view.</p>
        </div>
      ) : filter === "owned" ? (
        <div className="collection-grid">
          {filteredOwned.map(({ card, variant, row }) => {
            const compositeKey = row.cardId;
            const isUpdating = updatingCardId === compositeKey;

            return (
              <div
                key={compositeKey}
                className={`card-tile ${getAccentClass(card.name)}`}
              >
                <button
                  type="button"
                  className="card-open-region"
                  onClick={() => onCardClick(card.id)}
                >
                  <div className="card-media-button">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.images.small}
                      alt={card.name}
                      className="card-image"
                      loading="lazy"
                    />
                    <span className="status-pill status-pill-owned">Owned</span>
                  </div>
                  <div className="card-body">
                    <div className="card-title">{card.name}</div>
                    <div className="card-subtitle-row">
                      <span className="card-setname">{card.set.name}</span>
                      <span className="card-number">#{card.number}</span>
                    </div>
                    <div className="card-meta-row">
                      <span className="set-pill">{card.set.series}</span>
                      <span className="variant-capsule">{getVariantLabel(variant)}</span>
                      <span className="mini-pill">{card.set.releaseDate}</span>
                    </div>
                    {(() => {
                      const price = getPriceForCard(card, variant);
                      if (price.usd == null && price.eur == null) return null;
                      return (
                        <div className="price-pill-row">
                          {price.usd != null && (
                            <span className="price-pill price-pill-usd">
                              ${price.usd.toFixed(2)}
                            </span>
                          )}
                          {price.eur != null && (
                            <span className="price-pill price-pill-eur">
                              €{price.eur.toFixed(2)}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </button>
                <div className="card-action-wrap">
                  <div className="search-buttons-row">
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
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetOwned(card.id, variant, false)}
                    className="card-action secondary-button danger-button"
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Saving..." : "Remove from collection"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="collection-grid">
          {filteredCards.map((card) => {
            const owned = hasAnyOwnedVariant(card.id);
            const variants = card.variants ?? ["normal"];
            const hasMultipleVariants = variants.length > 1;
            const isUpdating = hasMultipleVariants
              ? variants.some((v) => updatingCardId === `${card.id}:${v}`)
              : updatingCardId === card.id;

            const handleAdd = () => {
              if (hasMultipleVariants) {
                setVariantPickerCard(card);
              } else {
                onSetOwned(card.id, variants[0], true);
              }
            };

            return (
              <div
                key={card.id}
                className={`card-tile ${getAccentClass(card.name)}`}
              >
                <button
                  type="button"
                  className="card-open-region"
                  onClick={() => onCardClick(card.id)}
                >
                  <div className="card-media-button">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.images.small}
                      alt={card.name}
                      className="card-image"
                      loading="lazy"
                    />
                    {owned && (
                      <span className="status-pill status-pill-owned">Owned</span>
                    )}
                    {!owned && (
                      <span className="status-pill status-pill-missing">Missing</span>
                    )}
                  </div>
                  <div className="card-body">
                    <div className="card-title">{card.name}</div>
                    <div className="card-subtitle-row">
                      <span className="card-setname">{card.set.name}</span>
                      <span className="card-number">#{card.number}</span>
                    </div>
                    <div className="card-meta-row">
                      <span className="set-pill">{card.set.series}</span>
                      <span className="mini-pill">{card.set.releaseDate}</span>
                    </div>
                    {(() => {
                      const price = getPriceForCard(card);
                      if (price.usd == null && price.eur == null) return null;
                      return (
                        <div className="price-pill-row">
                          {price.usd != null && (
                            <span className="price-pill price-pill-usd">
                              ${price.usd.toFixed(2)}
                            </span>
                          )}
                          {price.eur != null && (
                            <span className="price-pill price-pill-eur">
                              €{price.eur.toFixed(2)}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </button>
                <div className="card-action-wrap">
                  <div className="search-buttons-row">
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
                  </div>
                  <button
                    type="button"
                    onClick={handleAdd}
                    className="card-action primary-button"
                    disabled={isUpdating}
                  >
                    {isUpdating ? "Saving..." : "Add to collection"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {variantPickerCard && (
        <VariantPickerModal
          card={variantPickerCard}
          variants={variantPickerCard.variants ?? ["normal"]}
          onSelect={(variant) => {
            onSetOwned(variantPickerCard.id, variant, true);
            setVariantPickerCard(null);
          }}
          onClose={() => setVariantPickerCard(null)}
        />
      )}
    </div>
  );
}



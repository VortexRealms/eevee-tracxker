import { useMemo, useState } from "react";
import type { CollectionRow, PokemonCard } from "../types";
import { getEurUsdRate } from "../lib/cards";

interface CardGridProps {
  cards: PokemonCard[];
  collection: CollectionRow[];
  onCardClick: (cardId: string) => void;
  onSetOwned: (cardId: string, owned: boolean) => void;
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

  const collectionById = useMemo(
    () => new Map(collection.map((row) => [row.cardId, row])),
    [collection]
  );

  const eurUsdRate = getEurUsdRate();

  const counts = useMemo(() => {
    let owned = 0;
    let collectionValue = 0;
    for (const card of cards) {
      const row = collectionById.get(card.id);
      if (!row?.owned) continue;
      owned += 1;
      const usd =
        card.pricing?.usd != null
          ? card.pricing.usd
          : card.pricing?.eur != null
            ? card.pricing.eur * eurUsdRate
            : null;
      if (usd != null) collectionValue += usd;
    }
    return { owned, missing: cards.length - owned, collectionValue };
  }, [cards, collectionById, eurUsdRate]);

  const searchTokens = useMemo(
    () =>
      search
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter(Boolean),
    [search]
  );

  const filtered = useMemo(() => {
    return cards.filter((card) => {
      const row = collectionById.get(card.id);
      const owned = row?.owned ?? false;

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
  }, [cards, collectionById, filter, searchTokens]);

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
            <div className="stat-pill is-owned">
              <span>{counts.owned}</span>
              <small>owned</small>
            </div>
            <div className="stat-pill is-missing">
              <span>{counts.missing}</span>
              <small>missing</small>
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
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-orb" />
          <h2>No matching cards</h2>
          <p>Try a different search, or switch back to the full collection view.</p>
        </div>
      ) : (
        <div className="collection-grid">
          {filtered.map((card) => {
          const row = collectionById.get(card.id);
          const owned = row?.owned ?? false;

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
                    <span className="status-pill status-pill-owned">
                      Owned
                    </span>
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
                  {(card.pricing?.usd != null || card.pricing?.eur != null) && (
                    <div className="price-pill-row">
                      {card.pricing?.usd != null && (
                        <span className="price-pill price-pill-usd">
                          ${card.pricing.usd.toFixed(2)}
                        </span>
                      )}
                      {card.pricing?.eur != null && (
                        <span className="price-pill price-pill-eur">
                          €{card.pricing.eur.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
              <div className="card-action-wrap">
                <a
                  href={getEbaySearchUrl(card)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-action secondary-button ebay-button"
                >
                  Search eBay
                </a>
                <button
                  type="button"
                  onClick={() => onSetOwned(card.id, !owned)}
                  className={`card-action ${owned ? "secondary-button danger-button" : "primary-button"}`}
                  disabled={updatingCardId === card.id}
                >
                  {updatingCardId === card.id
                    ? "Saving..."
                    : owned
                      ? "Remove from collection"
                      : "Add to collection"}
                </button>
              </div>
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}



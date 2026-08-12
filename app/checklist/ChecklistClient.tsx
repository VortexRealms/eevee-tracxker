"use client";

import { useCallback, useEffect, useState } from "react";
import type { CollectionRow, PokemonCard, PricesSnapshot } from "../../types";
import { parseCardIdAndVariant } from "../../lib/cards";
import { CardGrid } from "../../components/CardGrid";
import { CardDetailModal } from "../../components/CardDetailModal";

interface CollectionResponse {
  rows: CollectionRow[];
  prices: PricesSnapshot;
}

const COLLECTION_CACHE_KEY = "eevee-tracker-collection-cache";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

async function fetchCollectionWithRetry(maxAttempts = 5): Promise<CollectionResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/collection", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Unexpected response (${res.status})`);
      }

      const data = (await res.json()) as CollectionResponse & { error?: string };

      if (!res.ok) {
        if (isRetryableStatus(res.status) && attempt < maxAttempts - 1) {
          const delay =
            res.status === 401 && attempt === 0
              ? 1200
              : Math.min(8000, 500 * 2 ** attempt);
          await sleep(delay);
          continue;
        }
        throw new Error(data.error ?? `Failed to load collection (${res.status})`);
      }

      if (!Array.isArray(data.rows) || !data.prices) {
        throw new Error("Invalid collection response");
      }

      return data;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await sleep(Math.min(8000, 500 * 2 ** attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not load collection data.");
}

interface ChecklistClientProps {
  cards: PokemonCard[];
  initialCollection: CollectionRow[];
  initialPrices: PricesSnapshot;
}

export function ChecklistClient({
  cards,
  initialCollection,
  initialPrices,
}: ChecklistClientProps) {
  const [collection, setCollection] = useState<CollectionRow[]>(initialCollection);
  const [prices, setPrices] = useState<PricesSnapshot>(initialPrices);
  const [error, setError] = useState<string | null>(null);
  const [allowStatsAnimation, setAllowStatsAnimation] = useState(false);
  const [activeSlot, setActiveSlot] = useState<{ cardId: string; variant: string } | null>(
    null
  );
  const [toast, setToast] = useState<string | null>(null);
  const [updatingCardId, setUpdatingCardId] = useState<string | null>(null);

  const loadCollection = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setError(null);
    }
    try {
      const data = await fetchCollectionWithRetry();
      setCollection(data.rows);
      setPrices(data.prices);
      try {
        sessionStorage.setItem(
          COLLECTION_CACHE_KEY,
          JSON.stringify({ rows: data.rows, prices: data.prices })
        );
      } catch {
        /* ignore quota / private mode */
      }
    } catch (err) {
      console.error(err);
      if (!options?.silent) {
        setError("Could not load collection data.");
      }
    }
  }, []);

  useEffect(() => {
    void loadCollection({ silent: true });
  }, [loadCollection]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setAllowStatsAnimation(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const activeCard =
    activeSlot != null ? cards.find((c) => c.id === activeSlot.cardId) ?? null : null;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function rowMatchesCardVariant(
    row: CollectionRow,
    targetCardId: string,
    targetVariant: string
  ): boolean {
    const { cardId: rowBase, variant: rowVariant } = parseCardIdAndVariant(row.cardId);
    const { cardId: targetBase, variant: parsedVariant } = parseCardIdAndVariant(targetCardId);
    const v = targetVariant || parsedVariant;
    return rowBase === targetBase && rowVariant === v;
  }

  async function handleSetOwned(cardId: string, variant: string, owned: boolean) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const compositeKey = `${cardId}:${variant}`;
    try {
      setUpdatingCardId(compositeKey);
      setError(null);
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          variant,
          name: card.name,
          setName: card.set.name,
          number: card.number,
          imageUrl: card.images.small,
          owned,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to update card (${res.status})`);
      }
      const data = (await res.json()) as { row: CollectionRow };
      setCollection((prev) => {
        const current = prev ?? [];
        const { cardId: baseId, variant: variantFromRow } = parseCardIdAndVariant(data.row.cardId);
        const idx = current.findIndex((r) => rowMatchesCardVariant(r, baseId, variantFromRow));
        const next = current.slice();
        if (idx >= 0) {
          if (data.row.owned) {
            next[idx] = data.row;
          } else {
            next.splice(idx, 1);
          }
        } else if (data.row.owned) {
          next.push(data.row);
        }
        return next;
      });
      setToast(
        owned ? `${card.name} added to collection` : `${card.name} removed from collection`
      );
    } catch (err) {
      console.error(err);
      setError("Could not update card. Try again.");
    } finally {
      setUpdatingCardId(null);
    }
  }

  const showLoadError =
    error === "Could not load collection data." && initialCollection.length === 0;

  return (
    <main className="page-stack">
      {showLoadError && (
        <p className="app-alert">
          {error}{" "}
          <button
            type="button"
            className="secondary-button"
            style={{ marginLeft: 8 }}
            onClick={() => void loadCollection()}
          >
            Retry
          </button>
        </p>
      )}

      {error && error !== "Could not load collection data." && (
        <p className="app-alert">{error}</p>
      )}

      <section className="page-scroll">
        <CardGrid
          cards={cards}
          collection={collection}
          prices={prices}
          onCardClick={(cardId, variant) => setActiveSlot({ cardId, variant })}
          onSetOwned={handleSetOwned}
          isLoading={false}
          animateStats={allowStatsAnimation}
          updatingCardId={updatingCardId}
        />
      </section>

      {toast && <div className="toast toast-success">{toast}</div>}

      <CardDetailModal
        card={activeCard}
        variant={activeSlot?.variant ?? null}
        prices={prices}
        onClose={() => setActiveSlot(null)}
      />
    </main>
  );
}

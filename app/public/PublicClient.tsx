"use client";

import { useCallback, useEffect, useState } from "react";
import type { CollectionRow, PokemonCard, PricesSnapshot } from "../../types";
import { CardGrid } from "../../components/CardGrid";
import { CardModal } from "../../components/CardModal";

interface CollectionResponse {
  rows: CollectionRow[];
  prices: PricesSnapshot;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPublicCollectionWithRetry(maxAttempts = 3): Promise<CollectionResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch("/api/public-collection", { method: "GET" });
      if (res.ok) {
        return (await res.json()) as CollectionResponse;
      }
      if (res.status >= 500 && attempt < maxAttempts - 1) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw new Error(`Failed to load collection (${res.status})`);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await sleep(400 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not load collection data.");
}

function noopSetOwned() {
  /* read-only showcase */
}

interface PublicClientProps {
  cards: PokemonCard[];
}

export function PublicClient({ cards }: PublicClientProps) {
  const [collection, setCollection] = useState<CollectionRow[] | null>(null);
  const [prices, setPrices] = useState<PricesSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const loadCollection = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchPublicCollectionWithRetry();
      setCollection(data.rows);
      setPrices(data.prices);
    } catch (err) {
      console.error(err);
      setError("Could not load collection data.");
    }
  }, []);

  useEffect(() => {
    void loadCollection();
  }, [loadCollection]);

  const activeCard =
    activeCardId != null ? cards.find((c) => c.id === activeCardId) ?? null : null;

  return (
    <main className="page-stack">
      {error && (
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

      <section className="page-scroll">
        <CardGrid
          mode="public"
          cards={cards}
          collection={collection ?? []}
          prices={prices}
          onCardClick={(cardId) => setActiveCardId(cardId)}
          onSetOwned={noopSetOwned}
          isLoading={collection === null}
          updatingCardId={null}
        />
      </section>

      <CardModal card={activeCard} onClose={() => setActiveCardId(null)} />
    </main>
  );
}

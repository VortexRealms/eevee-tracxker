"use client";

import { useEffect, useMemo, useState } from "react";
import type { CollectionRow, PokemonCard } from "../../types";
import { getAllCards } from "../../lib/cards";
import { CardGrid } from "../../components/CardGrid";
import { CardModal } from "../../components/CardModal";

interface CollectionResponse {
  rows: CollectionRow[];
}

function noopSetOwned() {
  /* read-only showcase */
}

export default function PublicCollectionPage() {
  const [collection, setCollection] = useState<CollectionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const cards: PokemonCard[] = useMemo(() => getAllCards(), []);

  useEffect(() => {
    async function loadCollection() {
      try {
        const res = await fetch("/api/public-collection", { method: "GET" });
        if (!res.ok) {
          throw new Error(`Failed to load collection (${res.status})`);
        }
        const data = (await res.json()) as CollectionResponse;
        setCollection(data.rows);
      } catch (err) {
        console.error(err);
        setError("Could not load collection data.");
      }
    }
    void loadCollection();
  }, []);

  const activeCard =
    activeCardId != null
      ? cards.find((c) => c.id === activeCardId) ?? null
      : null;

  return (
    <main className="page-stack">
      {error && <p className="app-alert">{error}</p>}

      <section className="page-scroll">
        <CardGrid
          mode="public"
          cards={cards}
          collection={collection ?? []}
          onCardClick={setActiveCardId}
          onSetOwned={noopSetOwned}
          isLoading={collection === null}
          updatingCardId={null}
        />
      </section>

      <CardModal card={activeCard} onClose={() => setActiveCardId(null)} />
    </main>
  );
}

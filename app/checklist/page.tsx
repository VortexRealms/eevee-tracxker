"use client";

import { useEffect, useMemo, useState } from "react";
import type { CollectionRow, PokemonCard } from "../../types";
import { getAllCards } from "../../lib/cards";
import { CardGrid } from "../../components/CardGrid";
import { CardModal } from "../../components/CardModal";

interface CollectionResponse {
  rows: CollectionRow[];
}

export default function ChecklistPage() {
  const [collection, setCollection] = useState<CollectionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [updatingCardId, setUpdatingCardId] = useState<string | null>(null);

  const cards: PokemonCard[] = useMemo(() => getAllCards(), []);

  useEffect(() => {
    async function loadCollection() {
      try {
        const res = await fetch("/api/collection", {
          method: "GET",
          credentials: "include"
        });
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

  const collectionById = useMemo(
    () => new Map((collection ?? []).map((row) => [row.cardId, row])),
    [collection]
  );

  const activeCard =
    activeCardId != null
      ? cards.find((c) => c.id === activeCardId) ?? null
      : null;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function handleSetOwned(cardId: string, owned: boolean) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    try {
      setUpdatingCardId(cardId);
      setError(null);
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          name: card.name,
          setName: card.set.name,
          number: card.number,
          imageUrl: card.images.small,
          owned
        })
      });
      if (!res.ok) {
        throw new Error(`Failed to update card (${res.status})`);
      }
      const data = (await res.json()) as { row: CollectionRow };
      setCollection((prev) => {
        const current = prev ?? [];
        const idx = current.findIndex((r) => r.cardId === data.row.cardId);
        if (idx === -1) return [...current, data.row];
        const next = current.slice();
        next[idx] = data.row;
        return next;
      });
      setToast(
        owned
          ? `${card.name} added to collection`
          : `${card.name} removed from collection`
      );
    } catch (err) {
      console.error(err);
      setError("Could not update card. Try again.");
    } finally {
      setUpdatingCardId(null);
    }
  }

  return (
    <main className="page-stack">
      {error && (
        <p className="app-alert">{error}</p>
      )}

      <section className="page-scroll">
        <CardGrid
          cards={cards}
          collection={collection ?? []}
          onCardClick={setActiveCardId}
          onSetOwned={handleSetOwned}
          isLoading={collection === null}
          updatingCardId={updatingCardId}
        />
      </section>

      {toast && <div className="toast toast-success">{toast}</div>}

      <CardModal
        card={activeCard}
        onClose={() => setActiveCardId(null)}
      />
    </main>
  );
}


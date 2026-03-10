"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PokemonCard } from "../types";

interface CardModalProps {
  card: PokemonCard | null;
  onClose: () => void;
}

export function CardModal({ card, onClose }: CardModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!card) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [card, onClose]);

  if (!mounted || !card) return null;

  return createPortal(
    <div className="card-modal-backdrop" role="dialog" aria-modal="true">
      <button
        type="button"
        className="card-modal-dismiss"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="card-modal-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="card-modal-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.images.large || card.images.small}
            alt={card.name}
            className="card-modal-image"
          />
          <button type="button" onClick={onClose} className="card-modal-close">
            ×
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { PokemonCard } from "../types";

const VARIANT_LABELS: Record<string, string> = {
  normal: "Normal",
  reverse: "Reverse Holofoil",
  holo: "Holofoil",
  firstEdition: "1st Edition",
  wPromo: "W Promo"
};

function getVariantLabel(variant: string): string {
  return VARIANT_LABELS[variant] ?? variant.charAt(0).toUpperCase() + variant.slice(1);
}

interface VariantPickerModalProps {
  card: PokemonCard | null;
  variants: string[];
  onSelect: (variant: string) => void;
  onClose: () => void;
}

export function VariantPickerModal({
  card,
  variants,
  onSelect,
  onClose
}: VariantPickerModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (!card) return null;

  return createPortal(
    <div className="card-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="variant-picker-title">
      <button
        type="button"
        className="card-modal-dismiss"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="card-modal-sheet variant-picker-sheet" onClick={(e) => e.stopPropagation()}>
        <h2 id="variant-picker-title" className="variant-picker-title">
          Choose variant
        </h2>
        <p className="variant-picker-subtitle">
          {card.name} · {card.set.name}
        </p>
        <div className="variant-picker-buttons">
          {variants.map((variant) => (
            <button
              key={variant}
              type="button"
              className="primary-button variant-picker-button"
              onClick={() => onSelect(variant)}
            >
              {getVariantLabel(variant)}
            </button>
          ))}
        </div>
        <button type="button" className="secondary-button variant-picker-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
}

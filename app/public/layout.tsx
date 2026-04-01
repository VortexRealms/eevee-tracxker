import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Public collection — Eevee Card Tracker",
  description: "A read-only view of an Eevee & Eeveelution Pokémon TCG collection."
};

export default function PublicLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}

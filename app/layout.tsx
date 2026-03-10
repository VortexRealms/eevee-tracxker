import "./globals.css";
import type { Metadata } from "next";
import { AppHeader } from "../components/AppHeader";

export const metadata: Metadata = {
  title: "Eevee Card Tracker",
  description: "Personal Eevee/Eeveelution Pokémon TCG collection tracker"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="app-body">
        <div className="app-shell">
          <AppHeader />
          <div className="app-frame">{children}</div>
        </div>
      </body>
    </html>
  );
}


import "./globals.css";
import type { Metadata } from "next";
import { AppShell } from "../components/AppShell";
import { CurrencyProvider } from "../components/CurrencyProvider";
import { HeaderStatsProvider } from "../components/HeaderStatsProvider";

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
        <CurrencyProvider>
          <HeaderStatsProvider>
            <AppShell>{children}</AppShell>
          </HeaderStatsProvider>
        </CurrencyProvider>
      </body>
    </html>
  );
}


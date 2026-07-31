"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDisplayPrice } from "../lib/display-price";
import { useHeaderStats } from "./HeaderStatsProvider";

export function AppHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { stats } = useHeaderStats();
  const showMenu = pathname === "/checklist" || pathname === "/settings";
  const showCompactStats = stats != null && !stats.panelVisible;
  const showPublicCaption =
    pathname === "/public" && (stats == null || stats.panelVisible);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  return (
    <div className="app-brandbar">
      <div className="brand-badge" />
      <div className="brand-copy">
        <div className="brand-kicker">Personal Collection</div>
        <div className="brand-title">Eevee &amp; Friends Tracker</div>
      </div>
      <div className="brand-right">
        {showCompactStats ? (
          <div
            className="brand-compact-stats"
            aria-live="polite"
            aria-label={`${stats.percent.toFixed(1)} percent owned, estimated value ${formatDisplayPrice(stats.estimatedValue, stats.currency)}`}
          >
            <span className="brand-compact-percent">
              {stats.percent.toFixed(1)}% owned
            </span>
            <span className="brand-compact-sep" aria-hidden="true">
              ·
            </span>
            <span className="brand-compact-value">
              {formatDisplayPrice(stats.estimatedValue, stats.currency)}
            </span>
          </div>
        ) : showPublicCaption ? (
          <div className="brand-caption">Public showcase • read-only</div>
        ) : null}
        {showMenu && (
          <div className="menu-anchor">
            <button
              type="button"
              className="menu-button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span />
              <span />
              <span />
            </button>
            {menuOpen && (
              <>
                <button
                  type="button"
                  className="menu-backdrop"
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="menu-panel">
                  <Link
                    href="/settings"
                    className="menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    Settings
                  </Link>
                  <form method="POST" action="/api/auth/logout">
                    <button type="submit" className="menu-item menu-item-danger">
                      Logout
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

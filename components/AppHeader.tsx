"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  formatCompactDisplayPrice,
  formatDisplayPrice,
} from "../lib/display-price";
import { useHeaderStats } from "./HeaderStatsProvider";

const APP_TITLE = "Eevee & Friends Tracker";

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
      <div className="brand-badge" aria-hidden="true" />
      <div className="brand-copy" aria-label={APP_TITLE}>
        <div className="brand-kicker">Personal Collection</div>
        <div className="brand-title">
          <span className="brand-title-full">{APP_TITLE}</span>
          <span className="brand-title-short">Eevee Tracker</span>
        </div>
      </div>
      <div className="brand-right">
        {showCompactStats ? (
          <div
            className="brand-compact-stats"
            aria-live="polite"
            aria-label={`${stats.percent.toFixed(1)} percent owned, estimated value ${formatDisplayPrice(stats.estimatedValue, stats.currency)}`}
          >
            <span className="brand-compact-percent">
              <span className="brand-compact-percent-value brand-compact-percent-value-full">
                {stats.percent.toFixed(1)}%
              </span>
              <span className="brand-compact-percent-value brand-compact-percent-value-short">
                {Math.round(stats.percent)}%
              </span>
              <span className="brand-compact-percent-label"> owned</span>
            </span>
            <span className="brand-compact-sep" aria-hidden="true">
              ·
            </span>
            <span className="brand-compact-value brand-compact-value-full">
              {formatDisplayPrice(stats.estimatedValue, stats.currency)}
            </span>
            <span className="brand-compact-value brand-compact-value-short">
              {formatCompactDisplayPrice(stats.estimatedValue, stats.currency)}
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

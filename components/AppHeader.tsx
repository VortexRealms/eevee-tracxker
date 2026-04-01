"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function AppHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const showMenu = pathname === "/checklist" || pathname === "/admin";

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
        <div className="brand-caption">
          {pathname === "/public"
            ? "Public showcase • read-only"
            : "Local card snapshot • Sheets sync"}
        </div>
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
                    href="/admin"
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


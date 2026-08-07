"use client";

import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <div className="login-app-shell">{children}</div>;
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <div className="app-frame">{children}</div>
    </div>
  );
}

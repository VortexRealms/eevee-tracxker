"use client";

import { useEffect, useState } from "react";
import styles from "./LoginShell.module.css";

function formatBuiltAt(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function BuildStamp() {
  const iso = process.env.NEXT_PUBLIC_APP_BUILT_AT;
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) return;
    setLabel(formatBuiltAt(iso));
  }, [iso]);

  if (!iso || !label) return null;

  return <p className={styles.buildStamp}>Last built {label}</p>;
}

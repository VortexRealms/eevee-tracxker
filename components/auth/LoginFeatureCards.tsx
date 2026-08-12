import { getCatalogueSlotTarget } from "../../lib/collection-target";
import { getAllCards } from "../../lib/cards";
import styles from "./LoginShell.module.css";

const TRACKED_VARIANTS = getCatalogueSlotTarget(getAllCards());

const FEATURES = [
  {
    label: "TRACKED VARIANTS",
    title: String(TRACKED_VARIANTS),
    description: "Across the full target list",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="4" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7" y="2" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
        <path d="M8 10h6M8 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "PRICE HISTORY",
    title: "Daily trends",
    description: "Track market changes over time",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 18V6M4 18h16M8 14l3-4 3 2 4-6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: "PUBLIC SHOWCASE",
    title: "Read-only view",
    description: "Share your collection publicly",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
] as const;

export function LoginFeatureCards() {
  return (
    <aside className={styles.featureColumn} aria-label="App features">
      <p className={styles.featureSectionLabel}>What you can track</p>
      <div className={styles.featureGrid}>
        {FEATURES.map((feature) => (
          <article key={feature.label} className={styles.featureCard}>
            <div className={styles.featureIconBubble}>{feature.icon}</div>
            <div className={styles.featureCopy}>
              <p className={styles.featureLabel}>{feature.label}</p>
              <p className={styles.featureTitle}>{feature.title}</p>
              <p className={styles.featureDescription}>{feature.description}</p>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

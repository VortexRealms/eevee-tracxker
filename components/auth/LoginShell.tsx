import { BuildStamp } from "./BuildStamp";
import { LoginCard } from "./LoginCard";
import { LoginFeatureCards } from "./LoginFeatureCards";
import { LoginHero } from "./LoginHero";
import styles from "./LoginShell.module.css";

type LoginShellProps = {
  showError?: boolean;
  showSessionError?: boolean;
};

export function LoginShell({ showError = false, showSessionError = false }: LoginShellProps) {
  return (
    <main className={styles.pageRoot}>
      <div className={styles.pageInner}>
        <header className={styles.brandBar}>
          <div className={styles.brandBadge} aria-hidden="true" />
          <div className={styles.brandCopy}>
            <p className={styles.brandKicker}>PERSONAL COLLECTION</p>
            <h1 className={styles.brandTitle}>Eevee &amp; Friends Tracker</h1>
          </div>
        </header>

        <section className={styles.mainStage}>
          <div className={styles.mainGrid}>
            <LoginHero />
            <LoginCard showError={showError} showSessionError={showSessionError} />
            <LoginFeatureCards />
          </div>
        </section>

        <footer className={styles.buildFooter}>
          <BuildStamp />
        </footer>
      </div>
    </main>
  );
}

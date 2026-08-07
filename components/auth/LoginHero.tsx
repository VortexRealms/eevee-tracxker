import styles from "./LoginShell.module.css";

export function LoginHero() {
  return (
    <div className={styles.loginHero}>
      <p className={styles.heroKicker}>YOUR COLLECTION HUB</p>
      <h2 className={styles.heroHeadline}>
        Track every variant.
        <br />
        Watch prices move.
      </h2>
      <p className={styles.heroBody}>
        Manage your Eevee and Eeveelution master set, follow daily market trends, and
        share a read-only showcase when you are ready.
      </p>
    </div>
  );
}

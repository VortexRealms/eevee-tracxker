"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./LoginShell.module.css";

type LoginCardProps = {
  showError?: boolean;
  showSessionError?: boolean;
};

export function LoginCard({ showError = false, showSessionError = false }: LoginCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setClientError(null);

    const formData = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        if (data.error === "invalid") {
          setClientError("Invalid username or password. Please try again.");
        } else if (data.error === "session") {
          setClientError(
            "Could not start your session. Check your database connection and try again."
          );
        } else {
          setClientError("Could not sign in. Please try again.");
        }
        return;
      }

      window.location.assign("/checklist");
    } catch {
      setClientError("Could not sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.loginCard}>
      <header className={styles.loginCardHeader}>
        <p className={styles.loginKicker}>WELCOME BACK</p>
        <h2 className={styles.loginHeading}>Sign in to your tracker</h2>
        <p className={styles.loginDescription}>
          Manage your Eevee and Eeveelution collection, pricing, and progress.
        </p>
      </header>

      {showError ? (
        <div className={styles.loginError} role="alert">
          Invalid username or password. Please try again.
        </div>
      ) : null}

      {showSessionError ? (
        <div className={styles.loginError} role="alert">
          Could not start your session. Check your database connection and try again.
        </div>
      ) : null}

      {clientError ? (
        <div className={styles.loginError} role="alert">
          {clientError}
        </div>
      ) : null}

      <form className={styles.loginForm} onSubmit={handleSubmit}>
        <div className={styles.fieldGroup}>
          <label className="field-label" htmlFor="username">
            Username
          </label>
          <div className={styles.inputWrap}>
            <span className={styles.inputIcon} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M5 20c0-3.314 3.134-6 7-6s7 2.686 7 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              id="username"
              name="username"
              autoComplete="username"
              className={`field-input ${styles.fieldInput}`}
              placeholder="Enter username"
              required
            />
          </div>
        </div>

        <div className={styles.fieldGroup}>
          <label className="field-label" htmlFor="password">
            Password
          </label>
          <div className={styles.inputWrap}>
            <span className={styles.inputIcon} aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M8 11V8a4 4 0 1 1 8 0v3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className={`field-input ${styles.fieldInput} ${styles.fieldInputWithToggle}`}
              placeholder="Enter password"
              required
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 3l18 18M10.5 10.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-1M7.4 7.5C5.6 8.8 4.2 10.6 3 12c2.5 4 6.5 6 9 6 1.2 0 2.4-.3 3.5-.8M14.1 5.2C13.4 5.1 12.7 5 12 5 9.5 5 5.5 7 3 12c.8 1.4 1.9 2.7 3.2 3.7"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className={styles.loginOptionsRow}>
          <label className={styles.rememberLabel} title="Coming soon">
            <input
              type="checkbox"
              disabled
              aria-disabled="true"
              className={styles.rememberCheckbox}
            />
            Remember me
          </label>
          <span className={styles.forgotDisabled} aria-disabled="true" tabIndex={-1}>
            Forgot password?
          </span>
        </div>

        <button type="submit" className={styles.loginButton} disabled={submitting}>
          {submitting ? "Signing in..." : "Login"}
        </button>
      </form>

      <Link href="/public" className={styles.publicLink}>
        View public collection
      </Link>
    </section>
  );
}

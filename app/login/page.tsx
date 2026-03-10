export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="login-screen">
      <section className="login-card">
        <form className="form-stack" method="POST" action="/api/auth/login">
          <label className="field-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            className="field-input"
            required
          />

          <label className="field-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="field-input"
            required
          />

          <button type="submit" className="primary-button primary-button-lg">
            Login
          </button>
        </form>
      </section>
    </main>
  );
}


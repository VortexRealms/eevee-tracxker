import { requireAuth } from "../../lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAuth();

  return (
    <main className="page-stack">
      <section className="panel-card panel-card-padded">
        <div className="page-kicker">Settings</div>
        <h1 className="page-title">Manual refresh tools</h1>
        <p className="page-copy">
          This app uses a local card snapshot for speed and predictable deploys.
          Refresh it manually whenever you want new data.
        </p>
      </section>

      <section className="panel-card panel-card-padded">
        <div className="chip-row">
          <span className="filter-chip is-active">Recommended</span>
          <span className="filter-chip">Manual control</span>
        </div>
        <p className="page-copy">
          Run <code className="inline-code">npm run fetch:cards</code> during development
          to rebuild <code className="inline-code">data/cards.json</code> from your local
          `pokemon-tcg-data` clone.
        </p>
      </section>
    </main>
  );
}


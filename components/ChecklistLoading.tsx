function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div className="collection-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card-tile card-skeleton">
          <div className="card-skeleton-media shimmer" />
          <div className="card-skeleton-lines">
            <div className="shimmer" />
            <div className="shimmer short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChecklistLoading() {
  return (
    <main className="page-stack">
      <section
        className="page-scroll"
        aria-busy="true"
        aria-labelledby="checklist-loading-status"
      >
        <p id="checklist-loading-status" className="sr-only" aria-live="polite">
          Loading your collection
        </p>

        <div className="collection-layout">
          <div className="sticky-toolbar">
            <div className="checklist-loading-banner">
              <p className="checklist-loading-kicker">Personal Collection</p>
              <p className="checklist-loading-title">Loading your collection…</p>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="Loading your collection"
              >
                <span className="progress-bar" />
              </div>
            </div>

            <div className="stats-skeleton" aria-hidden="true">
              <div className="stats-skeleton-ring shimmer" />
              <div className="stats-skeleton-copy">
                <div className="shimmer" />
                <div className="shimmer short" />
                <div className="shimmer stats-skeleton-bar" />
              </div>
              <div className="stats-skeleton-value shimmer" />
            </div>

            <div className="search-shell" aria-hidden="true">
              <div className="search-skeleton-bar shimmer" />
            </div>

            <div className="chip-row chip-row-scroll" aria-hidden="true">
              <span className="filter-chip-skeleton shimmer" />
              <span className="filter-chip-skeleton shimmer short" />
              <span className="filter-chip-skeleton shimmer" />
            </div>

            <div className="filter-toolbar" aria-hidden="true">
              <span className="filter-select-skeleton shimmer" />
              <span className="filter-select-skeleton shimmer" />
              <span className="cameo-checkbox-skeleton shimmer" />
            </div>
          </div>

          <CardSkeletons />
        </div>
      </section>
    </main>
  );
}

export function CardGridSkeletons({ count = 6 }: { count?: number }) {
  return <CardSkeletons count={count} />;
}

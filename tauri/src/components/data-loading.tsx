type DataPageSkeletonProps = {
  variant: "overview" | "insights" | "table"
}

const METRIC_PLACEHOLDERS = [0, 1, 2, 3]
const TABLE_ROW_PLACEHOLDERS = [0, 1, 2, 3, 4, 5]

export function DataPageSkeleton({ variant }: DataPageSkeletonProps) {
  const isTable = variant === "table"

  return (
    <div
      className={`page-stack data-page-skeleton ${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading data</span>
      <section className="panel skeleton-panel skeleton-hero">
        <span className="skeleton-block skeleton-kicker" />
        <span className="skeleton-block skeleton-title" />
        <span className="skeleton-block skeleton-copy" />
      </section>

      {isTable ? (
        <>
          <section className="panel skeleton-panel skeleton-filters">
            <span className="skeleton-block" />
            <span className="skeleton-block" />
            <span className="skeleton-block" />
          </section>
          <section className="panel skeleton-panel skeleton-table">
            {TABLE_ROW_PLACEHOLDERS.map((row) => (
              <span className="skeleton-block skeleton-row" key={row} />
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="metrics-grid">
            {METRIC_PLACEHOLDERS.map((metric) => (
              <div className="metric-card skeleton-panel" key={metric}>
                <span className="skeleton-block skeleton-kicker" />
                <span className="skeleton-block skeleton-value" />
                <span className="skeleton-block skeleton-copy" />
              </div>
            ))}
          </section>
          <section className="panel skeleton-panel skeleton-chart">
            <span className="skeleton-block skeleton-title" />
            <span className="skeleton-block skeleton-chart-body" />
          </section>
        </>
      )}
    </div>
  )
}

export function InlineListSkeleton() {
  return (
    <div
      className="inline-list-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading applications</span>
      {METRIC_PLACEHOLDERS.map((row) => (
        <span className="skeleton-block skeleton-row" key={row} />
      ))}
    </div>
  )
}

export function RefreshStatus({
  refreshing,
  error,
}: {
  refreshing: boolean
  error: string | null
}) {
  if (refreshing) {
    return (
      <div className="data-refresh-status" role="status" aria-live="polite">
        <span className="refresh-spinner" aria-hidden="true" />
        Updating…
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="data-refresh-status warning"
        role="status"
        aria-live="polite"
      >
        Could not refresh: {error}
      </div>
    )
  }

  return null
}

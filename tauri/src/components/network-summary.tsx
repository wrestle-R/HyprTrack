import { useDesktopQuery } from "../hooks/use-desktop-query"
import { getNetwork } from "../lib/desktop-api"
import { formatBytes } from "../lib/network"
import type { RangeKey } from "../lib/types"

export function NetworkSummary({ range, refreshVersion, onOpen }: {
  range: RangeKey; refreshVersion: number; onOpen: () => void
}) {
  const query = useDesktopQuery(() => getNetwork(range), [range, refreshVersion], `network-summary:${range}`)
  const data = query.data
  const measured = data && (data.observedSeconds > 0 || data.applications.length > 0)
  return <button type="button" className="metric-card overview-network-summary" onClick={onOpen} aria-label="Open Dataflow internet usage" title="Open detailed internet usage in Dataflow">
    <span className="metric-label">Internet usage <span aria-hidden="true">↗</span></span>
    <strong className="metric-value">{measured ? formatBytes(data.rxBytes + data.txBytes) : "—"}</strong>
    <span className="metric-detail">{query.error ? "Temporarily unavailable" : query.loading ? "Loading…" : measured ? `↓ ${formatBytes(data.rxBytes)} · ↑ ${formatBytes(data.txBytes)}` : data?.health.state === "setup_required" ? "Set up Dataflow" : "No recorded usage"}</span>
  </button>
}

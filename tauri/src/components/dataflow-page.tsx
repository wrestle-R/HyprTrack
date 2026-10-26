import { useDeferredValue, useEffect, useId, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, ArrowUp01Icon, InternetIcon } from "@hugeicons/core-free-icons"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useDesktopQuery } from "../hooks/use-desktop-query"
import { getNetwork } from "../lib/desktop-api"
import { formatTimestamp } from "../lib/format"
import { formatBytes, rankedApplications, type NetworkApplication, type NetworkPoint } from "../lib/network"
import type { RangeKey } from "../lib/types"
import { DataPageSkeleton, RefreshStatus } from "./data-loading"
import "./dataflow.css"

const STATUS_LABELS: Record<string, string> = {
  recording: "Recording", setup_required: "Setup needed", offline: "Offline",
  starting: "Connecting", stopped: "Collector stopped", stale: "Collector unavailable",
  error: "Needs attention", not_running: "Waiting for collector",
}

function TransferTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload?: NetworkPoint }>
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return <div className="chart-tooltip dataflow-tooltip">
    <span>{point.label} · IST</span>
    <div><i className="dataflow-dot download" />Downloaded<strong>{point.rxBytes === null ? "No observation" : formatBytes(point.rxBytes)}</strong></div>
    <div><i className="dataflow-dot upload" />Uploaded<strong>{point.txBytes === null ? "No observation" : formatBytes(point.txBytes)}</strong></div>
  </div>
}

export function DataflowPage({ range, refreshVersion }: { range: RangeKey; refreshVersion: number }) {
  const [allHistory, setAllHistory] = useState(false)
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [scope, setScope] = useState<"all" | NetworkApplication["scope"]>("all")
  const [sort, setSort] = useState<"total" | "download" | "upload">("total")
  const [series, setSeries] = useState<"both" | "download" | "upload">("both")
  const gradientId = useId().replace(/:/g, "")
  useEffect(() => setAllHistory(false), [range])
  const effectiveRange = allHistory ? "all" : range
  const query = useDesktopQuery(() => getNetwork(effectiveRange), [effectiveRange, refreshVersion], `network:${effectiveRange}`)
  if (query.loading || !query.data) {
    if (query.error) return <div className="error-state" role="alert"><strong>Could not load Dataflow</strong><p>{query.error}</p></div>
    return <DataPageSkeleton variant="overview" />
  }
  const data = query.data
  const measured = data.observedSeconds > 0 || data.applications.length > 0
  const total = data.rxBytes + data.txBytes
  const apps = rankedApplications(data.applications, deferredSearch, scope, sort)
  const unknown = data.applications.filter((app) => app.scope === "unknown").reduce((sum, app) => sum + app.rxBytes + app.txBytes, 0)

  return <div className="page-stack dataflow-page" aria-busy={query.refreshing}>
    <RefreshStatus refreshing={query.refreshing} error={query.error} />
    <section className="dataflow-intro">
      <div><p className="eyebrow">Internet activity</p><h1>A little perspective<br />on every byte.</h1><p>Downloads, uploads, and the apps behind them.</p></div>
      <div className="dataflow-context">
        <span className={`dataflow-status ${data.health.state}`} role="status"><i />{STATUS_LABELS[data.health.state] ?? "Unavailable"}</span>
        <span>Apps + system services</span>
        <button type="button" className={`button secondary ${allHistory ? "selected" : ""}`} aria-pressed={allHistory} onClick={() => setAllHistory((value) => !value)}>{allHistory ? "Back to selected range" : "Explore all history"}</button>
      </div>
    </section>

    <section className="dataflow-stats" aria-label="Internet usage totals">
      <div className="dataflow-total"><span>Total transferred</span><strong>{measured ? formatBytes(total) : "—"}</strong><small>{data.rangeLabel}</small></div>
      <div><span><HugeiconsIcon icon={ArrowDown01Icon} size={16} />Downloaded</span><strong>{measured ? formatBytes(data.rxBytes) : "—"}</strong><small>Received by your apps</small></div>
      <div><span><HugeiconsIcon icon={ArrowUp01Icon} size={16} />Uploaded</span><strong>{measured ? formatBytes(data.txBytes) : "—"}</strong><small>Sent from your apps</small></div>
      <div><span>Tracking coverage</span><strong>{measured ? `${data.coveragePercent}%` : "—"}</strong><small>Of the selected period</small></div>
    </section>

    <section className="panel dataflow-chart-panel">
      <div className="panel-header"><div><p className="eyebrow">The ebb & flow</p><h2>Your internet, over time</h2><p>{data.rangeLabel} · IST · Gaps mean no observation.</p></div>
        <div className="segmented-control" role="group" aria-label="Graph series">
          {(["both", "download", "upload"] as const).map((value) => <button type="button" key={value} className={series === value ? "active" : ""} aria-pressed={series === value} onClick={() => setSeries(value)}>{value === "both" ? "Both" : value === "download" ? "Download" : "Upload"}</button>)}
        </div>
      </div>
      {measured ? <>
        <div className="dataflow-legend"><span><i className="dataflow-dot download" />Download</span><span><i className="dataflow-dot upload" />Upload</span><span>Transferred per interval</span></div>
        <div className="dataflow-chart" role="img" aria-label={`Internet usage: ${formatBytes(data.rxBytes)} downloaded and ${formatBytes(data.txBytes)} uploaded. Exact application totals are in the table below.`}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={data.timeline} margin={{ top: 16, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
              <defs><linearGradient id={`${gradientId}-rx`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient><linearGradient id={`${gradientId}-tx`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--signal)" stopOpacity={0.12} /><stop offset="100%" stopColor="var(--signal)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 6" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={32} tickMargin={12} />
              <YAxis tickFormatter={formatBytes} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={65} />
              <Tooltip content={<TransferTooltip />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 4" }} />
              {series !== "upload" ? <Area type="monotone" dataKey="rxBytes" name="Downloaded" stroke="var(--primary)" fill={`url(#${gradientId}-rx)`} strokeWidth={2.4} connectNulls={false} isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 3, stroke: "var(--card)" }} /> : null}
              {series !== "download" ? <Area type="monotone" dataKey="txBytes" name="Uploaded" stroke="var(--signal)" fill={`url(#${gradientId}-tx)`} strokeWidth={2} connectNulls={false} isAnimationActive={false} dot={false} activeDot={{ r: 4, strokeWidth: 3, stroke: "var(--card)" }} /> : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </> : <div className="dataflow-empty"><HugeiconsIcon icon={InternetIcon} size={38} strokeWidth={1.2} /><h3>Your first bytes will show up here.</h3><p>{data.health.detail || "Keep the collector running to build your usage history."}</p><small>No activity has been measured for this period.</small></div>}
      {data.health.updatedAt ? <p className="dataflow-updated">Collector last reported {formatTimestamp(data.health.updatedAt, true)}</p> : null}
    </section>

    {data.health.state !== "recording" ? <details className="panel dataflow-setup" open={data.health.state === "setup_required"}>
      <summary>Get Dataflow recording <span>One setup, then your usual collector command.</span></summary>
      <p>{data.health.detail}</p><p>Launch the updated HyprTrack app once to export the collector files. Then install and prepare the native capture tool:</p>
      <pre><code>{'sudo pacman -S --needed nethogs\nsudo bash ~/.local/bin/hyprtrack/collector/setup-network.sh "$(id -un)"'}</code></pre>
      <p>Restart your existing HyprTrack collector once after updating. It starts both screen-time and internet tracking. The dashboard runs as your ordinary user.</p>
    </details> : null}

    <section className="panel dataflow-apps">
      <div className="panel-header"><div><p className="eyebrow">Where it goes</p><h2>Applications & services</h2><p>One total per app. Browser tabs stay together.</p></div><span className="pill">{data.applications.length} recorded</span></div>
      <div className="dataflow-filters"><input className="input" type="search" placeholder="Find an app or service…" aria-label="Search internet applications" data-page-search value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="select" aria-label="Filter internet applications" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}><option value="all">All activity</option><option value="app">User apps</option><option value="system">System services</option><option value="unknown">Unattributed</option></select>
        <select className="select" aria-label="Sort internet applications" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="total">Most data</option><option value="download">Most downloaded</option><option value="upload">Most uploaded</option></select>
      </div>
      {apps.length ? <div className="dataflow-table-wrap"><table className="data-table"><caption className="sr-only">Internet bytes by application for {data.rangeLabel}</caption><thead><tr><th>Application</th><th>Downloaded</th><th>Uploaded</th><th>Total data</th></tr></thead><tbody>{apps.map((app, index) => {
        const bytes = app.rxBytes + app.txBytes
        return <tr key={`${app.appId}:${app.scope}`}><td><div className="dataflow-app-identity"><span className="dataflow-rank">{String(index + 1).padStart(2, "0")}</span><div><strong>{app.appName}</strong><small>{app.scope === "system" ? "System service" : app.scope === "unknown" ? "Ownership unavailable" : "Application"}</small></div></div></td><td>{formatBytes(app.rxBytes)}</td><td>{formatBytes(app.txBytes)}</td><td><strong>{formatBytes(bytes)}</strong><div className="dataflow-share" aria-label={`${total ? Math.round(bytes / total * 100) : 0}% of all recorded data`}><span style={{ width: `${total ? Math.max(1, bytes / total * 100) : 0}%` }} /></div></td></tr>
      })}</tbody></table></div> : <p className="dataflow-table-empty">{data.applications.length ? "No applications match these filters." : "Apps will appear as their traffic is recorded."}</p>}
      {unknown > 0 ? <p className="dataflow-footnote">{formatBytes(unknown)} could not be linked to a process. It stays in Unattributed and is included in the total.</p> : null}
    </section>

    <footer className="dataflow-retention"><div><strong>Detail for 30 days. Daily totals for the long run.</strong><p>Older internet and screen-time records are compacted into daily app summaries. Totals stay; individual sessions and samples expire.</p></div><span>{data.archivedDays} internet days · {data.archivedActivityDays} screen-time days archived</span></footer>
    <p className="dataflow-accounting">Native TCP + UDP accounting on physical interfaces. Loopback and virtual interfaces are excluded. LAN traffic on those interfaces is included; totals can differ from your provider’s meter. Collection runs with your desktop session.</p>
  </div>
}

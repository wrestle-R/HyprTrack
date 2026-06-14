import * as React from "react"
import { listen } from "@tauri-apps/api/event"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import "./App.css"
import {
  getActivity,
  getApplications,
  getAutostartStatus,
  getCollectorStatus,
  getHealth,
  getOverview,
  restartCollector,
  setAutostart,
  startCollector,
  stopCollector,
} from "./lib/desktop-api"
import {
  getApplicationSource,
  getApplicationSourceLabel,
  type ApplicationSource,
} from "./lib/application-source"
import {
  calculateProductiveMinutes,
  formatDate,
  formatDuration,
  formatTimestamp,
} from "./lib/format"
import {
  FONT_SIZE_PIXELS,
  getPreferencesSnapshot,
  getServerPreferencesSnapshot,
  SIDEBAR_WIDTH_PIXELS,
  subscribePreferences,
  writePreferences,
  type DesktopPreferences,
} from "./lib/preferences"
import type {
  ActivityData,
  ApplicationsData,
  CollectorStatus,
  DesktopPage,
  HealthData,
  OverviewData,
  RangeKey,
} from "./lib/types"
import { useDesktopQuery } from "./hooks/use-desktop-query"

const PAGES: Array<{ id: DesktopPage; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Daily focus at a glance" },
  { id: "activity", label: "Activity", description: "Browse grouped sessions" },
  { id: "applications", label: "Applications", description: "Compare usage" },
  { id: "settings", label: "Settings", description: "Appearance and tracking" },
]

function useDesktopPreferences() {
  const preferences = React.useSyncExternalStore(
    subscribePreferences,
    getPreferencesSnapshot,
    getServerPreferencesSnapshot
  )

  const updatePreferences = React.useCallback(
    (
      update:
        | Partial<DesktopPreferences>
        | ((current: DesktopPreferences) => DesktopPreferences)
    ) => {
      const current = getPreferencesSnapshot()
      const next =
        typeof update === "function"
          ? update(current)
          : { ...current, ...update, version: 1 as const }
      writePreferences(next)
    },
    []
  )

  return { preferences, updatePreferences }
}

function useResolvedTheme(theme: DesktopPreferences["theme"]) {
  const [systemDark, setSystemDark] = React.useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  return theme === "system" ? (systemDark ? "dark" : "light") : theme
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="error-state">
      <strong>Could not load data</strong>
      <p>{message}</p>
    </div>
  )
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </div>
  )
}

function OverviewPage({
  range,
  refreshVersion,
  productiveTitles,
}: {
  range: RangeKey
  refreshVersion: number
  productiveTitles: string[]
}) {
  const query = useDesktopQuery<OverviewData>(
    () => getOverview(range),
    [range, refreshVersion]
  )

  if (query.loading && !query.data) {
    return <EmptyState title="Loading overview" description="Reading local activity analytics." />
  }
  if (query.error && !query.data) {
    return <ErrorState message={query.error} />
  }
  if (!query.data || query.data.trackedMinutes === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Keep the collector running and this overview will fill in automatically."
      />
    )
  }

  const productiveMinutes = calculateProductiveMinutes(
    query.data.applications,
    productiveTitles
  )

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">{query.data.range.label}</p>
          <h1>Local activity intelligence</h1>
          <p className="hero-copy">
            Read-only analytics from your HyprTrack collector with a denser desktop shell.
          </p>
        </div>
        <div className="hero-meta">
          <span>Latest sample</span>
          <strong>
            {query.data.latestSampleAt
              ? formatTimestamp(query.data.latestSampleAt, true)
              : "Unavailable"}
          </strong>
        </div>
      </section>

      <section className="metrics-grid">
        <Metric
          label="Tracked time"
          value={formatDuration(query.data.trackedMinutes)}
          detail="Measured from completed activity intervals"
        />
        <Metric
          label="Productive time"
          value={formatDuration(productiveMinutes)}
          detail={`${Math.round((productiveMinutes / query.data.trackedMinutes) * 100)}% of tracked time`}
        />
        <Metric
          label="Top application"
          value={query.data.topApplication?.windowTitle ?? "None"}
          detail={
            query.data.topApplication
              ? `${formatDuration(query.data.topApplication.minutes)} tracked`
              : "No activity"
          }
        />
        <Metric
          label="Active streak"
          value={`${query.data.streakDays} ${query.data.streakDays === 1 ? "day" : "days"}`}
          detail="Consecutive days with tracked activity"
        />
      </section>

      <section className="chart-panel panel">
        <div className="panel-header">
          <div>
            <h2>Activity rhythm</h2>
            <p>Minutes captured across the selected range.</p>
          </div>
        </div>
        <div className="chart-frame">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={query.data.timeline} margin={{ top: 16, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="hyprtrackArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.34} />
                  <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={32} />
              <YAxis tickLine={false} axisLine={false} width={32} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                }}
              />
              <Area
                type="monotone"
                dataKey="minutes"
                stroke="var(--chart-3)"
                fill="url(#hyprtrackArea)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Application usage</h2>
              <p>Ranked by tracked duration.</p>
            </div>
          </div>
          <div className="stack-list">
            {query.data.applications.slice(0, 6).map((application, index) => (
              <div key={`${application.appClass}-${application.windowTitle}`} className="usage-row">
                <span className="usage-rank">{String(index + 1).padStart(2, "0")}</span>
                <div className="usage-main">
                  <div className="usage-row-header">
                    <strong>{application.windowTitle}</strong>
                    <span>{formatDuration(application.minutes)}</span>
                  </div>
                  <p>
                    {application.appClass} · {application.sessionCount}{" "}
                    {application.sessionCount === 1 ? "session" : "sessions"}
                  </p>
                  <div className="usage-bar">
                    <div style={{ width: `${application.share}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Recent activity</h2>
              <p>Consecutive matching intervals are grouped into sessions.</p>
            </div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Class</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {query.data.recentSessions.map((session) => (
                <tr key={`${session.startAt}-${session.appClass}-${session.windowTitle}`}>
                  <td>{session.windowTitle}</td>
                  <td>{session.appClass}</td>
                  <td>{formatTimestamp(session.startAt, true)}</td>
                  <td>{formatDuration(session.durationMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function ActivityPage({
  range,
  refreshVersion,
  compact,
}: {
  range: RangeKey
  refreshVersion: number
  compact: boolean
}) {
  const [search, setSearch] = React.useState("")
  const deferredSearch = React.useDeferredValue(search)
  const [app, setApp] = React.useState("")
  const filterKey = `${range}\u0000${deferredSearch}\u0000${app}`
  const [pageState, setPageState] = React.useState({
    filterKey,
    page: 1,
  })
  const page = pageState.filterKey === filterKey ? pageState.page : 1
  const pageSize = 15

  const query = useDesktopQuery<ActivityData>(
    () =>
      getActivity({
        range,
        app: app || undefined,
        search: deferredSearch || undefined,
        page,
        pageSize,
      }),
    [range, app, deferredSearch, page, refreshVersion]
  )

  React.useEffect(() => {
    setPageState((current) =>
      current.filterKey === filterKey ? current : { filterKey, page: 1 }
    )
  }, [filterKey])

  if (query.loading && !query.data) {
    return <EmptyState title="Loading activity" description="Grouping tracked sessions." />
  }
  if (query.error && !query.data) {
    return <ErrorState message={query.error} />
  }
  if (!query.data) {
    return null
  }

  const totalPages = query.data.pagination.totalPages

  return (
    <div className="page-stack">
      <section className="panel filters-panel">
        <div className="panel-header">
          <div>
            <h2>Activity</h2>
            <p>Inspect grouped focus sessions without exposing full raw titles.</p>
          </div>
          <span className="pill">{query.data.range.label}</span>
        </div>
        <div className="filters-row">
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search application class or title"
          />
          <select
            className="select"
            value={app}
            onChange={(event) => setApp(event.currentTarget.value)}
          >
            <option value="">All application classes</option>
            {query.data.appClasses.map((appClass) => (
              <option key={appClass} value={appClass}>
                {appClass}
              </option>
            ))}
          </select>
          <span className="subtle-copy">
            {query.data.pagination.totalItems} grouped{" "}
            {query.data.pagination.totalItems === 1 ? "session" : "sessions"}
          </span>
        </div>
      </section>

      {query.data.sessions.length === 0 ? (
        <EmptyState
          title="No matching sessions"
          description="Change the search, application filter, or date range."
        />
      ) : (
        <section className="panel">
          <table className={`data-table ${compact ? "compact" : ""}`}>
            <thead>
              <tr>
                <th>Window title</th>
                <th>Class</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Duration</th>
                <th>Intervals</th>
              </tr>
            </thead>
            <tbody>
              {query.data.sessions.map((session) => (
                <tr key={`${session.startAt}-${session.appClass}-${session.windowTitle}`}>
                  <td>{session.windowTitle}</td>
                  <td>{session.appClass}</td>
                  <td>{formatTimestamp(session.startAt, true)}</td>
                  <td>{formatTimestamp(session.endAt)}</td>
                  <td>{formatDuration(session.durationMinutes)}</td>
                  <td>{session.sampleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="pager">
        <span>
          Page {query.data.pagination.page} of {query.data.pagination.totalPages}
        </span>
        <div className="pager-actions">
          <button
            className="button secondary"
            type="button"
            disabled={page <= 1}
            onClick={() =>
              setPageState((current) => ({
                filterKey,
                page: Math.max(1, current.page - 1),
              }))
            }
          >
            Previous
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={page >= totalPages}
            onClick={() =>
              setPageState((current) => ({
                filterKey,
                page: Math.min(totalPages, current.page + 1),
              }))
            }
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

function ApplicationsPage({
  range,
  refreshVersion,
}: {
  range: RangeKey
  refreshVersion: number
}) {
  const [search, setSearch] = React.useState("")
  const deferredSearch = React.useDeferredValue(search)
  const [selected, setSelected] = React.useState<string | null>(null)
  const query = useDesktopQuery<ApplicationsData>(
    () => getApplications(range, deferredSearch || undefined),
    [range, deferredSearch, refreshVersion]
  )

  if (query.loading && !query.data) {
    return <EmptyState title="Loading applications" description="Ranking normalized labels." />
  }
  if (query.error && !query.data) {
    return <ErrorState message={query.error} />
  }
  if (!query.data) {
    return null
  }

  const application =
    query.data.items.find(
      (item) => `${item.appClass}\u0000${item.windowTitle}` === selected
    ) ?? null

  return (
    <div className="page-stack">
      <section className="panel filters-panel">
        <div className="panel-header">
          <div>
            <h2>Applications</h2>
            <p>Compare normalized window labels, session counts, and usage share.</p>
          </div>
          <span className="pill">{query.data.range.label}</span>
        </div>
        <div className="filters-row">
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search applications"
          />
          <span className="subtle-copy">
            {query.data.items.length} normalized{" "}
            {query.data.items.length === 1 ? "label" : "labels"}
          </span>
        </div>
      </section>

      <section className="details-layout">
        <div className="panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Application</th>
                <th>Class</th>
                <th>Usage</th>
                <th>Sessions</th>
                <th>Last active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((item, index) => (
                <tr key={`${item.appClass}-${item.windowTitle}`}>
                  <td>{String(index + 1).padStart(2, "0")}</td>
                  <td>
                    <strong>{item.windowTitle}</strong>
                    <div className="usage-bar inline">
                      <div style={{ width: `${item.share}%` }} />
                    </div>
                  </td>
                  <td>{item.appClass}</td>
                  <td>
                    {formatDuration(item.minutes)} · {item.share}%
                  </td>
                  <td>{item.sessionCount}</td>
                  <td>{formatTimestamp(item.lastSeen, true)}</td>
                  <td>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => setSelected(`${item.appClass}\u0000${item.windowTitle}`)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="panel inspector-panel">
          {application ? (
            <>
              <div className="panel-header">
                <div>
                  <h2>{application.windowTitle}</h2>
                  <p>Usage details derived from normalized HyprTrack activity.</p>
                </div>
              </div>
              <div className="stats-two-column">
                <div>
                  <span>Tracked</span>
                  <strong>{formatDuration(application.minutes)}</strong>
                </div>
                <div>
                  <span>Share</span>
                  <strong>{application.share}%</strong>
                </div>
                <div>
                  <span>Sessions</span>
                  <strong>{application.sessionCount}</strong>
                </div>
                <div>
                  <span>Class</span>
                  <strong>{application.appClass}</strong>
                </div>
              </div>
              <div className="inspector-section">
                <h3>Visibility</h3>
                <p>
                  First seen {formatDate(application.firstSeen)}. Last active{" "}
                  {formatTimestamp(application.lastSeen, true)}.
                </p>
              </div>
              <div className="inspector-section">
                <h3>Recent sessions</h3>
                {application.recentSessions.length === 0 ? (
                  <p>No sessions in this range.</p>
                ) : (
                  application.recentSessions.map((session) => (
                    <div key={session.startAt} className="session-blip">
                      <div>
                        <strong>{formatTimestamp(session.startAt, true)}</strong>
                        <span>
                          {session.sampleCount}{" "}
                          {session.sampleCount === 1 ? "interval" : "intervals"}
                        </span>
                      </div>
                      <em>{formatDuration(session.durationMinutes)}</em>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <EmptyState
              title="Select an application"
              description="Pick a row to inspect usage details and recent sessions."
            />
          )}
        </aside>
      </section>
    </div>
  )
}

function SettingsPage({
  preferences,
  updatePreferences,
  collectorStatus,
  health,
  autostartEnabled,
  onToggleAutostart,
  onCollectorAction,
}: {
  preferences: DesktopPreferences
  updatePreferences: (
    update:
      | Partial<DesktopPreferences>
      | ((current: DesktopPreferences) => DesktopPreferences)
  ) => void
  collectorStatus: CollectorStatus | null
  health: HealthData | null
  autostartEnabled: boolean
  onToggleAutostart: (enabled: boolean) => void
  onCollectorAction: (action: "start" | "stop" | "restart") => void
}) {
  const [applicationSource, setApplicationSource] =
    React.useState<ApplicationSource>("app")
  const applications = useDesktopQuery<ApplicationsData>(
    () => getApplications("30d"),
    []
  )

  const visibleApplications =
    applications.data?.items.filter(
      (application) =>
        getApplicationSource(application.appClass) === applicationSource
    ) ?? []

  return (
    <div className="page-stack">
      <section className="settings-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Appearance</h2>
              <p>Keep the desktop app aligned with the web theme tokens.</p>
            </div>
          </div>
          <div className="toggle-grid">
            {(["system", "light", "dark"] as const).map((theme) => (
              <button
                key={theme}
                className={`button ${
                  preferences.theme === theme ? "primary" : "secondary"
                }`}
                type="button"
                onClick={() => updatePreferences({ theme })}
              >
                {theme}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Default date range</h2>
              <p>Applied when the desktop app opens.</p>
            </div>
          </div>
          <div className="toggle-grid">
            {(["today", "7d", "30d"] as const).map((range) => (
              <button
                key={range}
                className={`button ${
                  preferences.defaultRange === range ? "primary" : "secondary"
                }`}
                type="button"
                onClick={() => updatePreferences({ defaultRange: range })}
              >
                {range === "today" ? "Today" : range}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Font size</h2>
              <p>Scale text and interface spacing across the app.</p>
            </div>
          </div>
          <div className="toggle-grid">
            {(["small", "default", "large"] as const).map((fontSize) => (
              <button
                key={fontSize}
                className={`button ${
                  preferences.fontSize === fontSize ? "primary" : "secondary"
                }`}
                type="button"
                onClick={() => updatePreferences({ fontSize })}
              >
                {fontSize}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Sidebar width</h2>
              <p>Choose how much horizontal room the app shell uses.</p>
            </div>
          </div>
          <div className="toggle-grid">
            {(["narrow", "default", "wide"] as const).map((width) => (
              <button
                key={width}
                className={`button ${
                  preferences.sidebarWidth === width ? "primary" : "secondary"
                }`}
                type="button"
                onClick={() => updatePreferences({ sidebarWidth: width })}
              >
                {width}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="split-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Tracker control</h2>
              <p>Native collector actions stay separate from database reads.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="status-tile">
              <span>Collector state</span>
              <strong>{collectorStatus?.message ?? "Checking collector…"}</strong>
            </div>
            <div className="status-tile">
              <span>Database path</span>
              <strong>{collectorStatus?.dbPath ?? "Unavailable"}</strong>
            </div>
            <div className="status-tile">
              <span>Latest activity</span>
              <strong>
                {collectorStatus?.latestSampleAt
                  ? formatTimestamp(collectorStatus.latestSampleAt, true)
                  : "Unavailable"}
              </strong>
            </div>
            <div className="toggle-row">
              <div>
                <strong>Launch at login</strong>
                <p>Linux autostart for this desktop shell.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={autostartEnabled}
                  onChange={(event) => onToggleAutostart(event.currentTarget.checked)}
                />
                <span />
              </label>
            </div>
            <div className="button-row">
              <button className="button primary" type="button" onClick={() => onCollectorAction("start")}>
                Start collector
              </button>
              <button className="button secondary" type="button" onClick={() => onCollectorAction("stop")}>
                Stop collector
              </button>
              <button className="button secondary" type="button" onClick={() => onCollectorAction("restart")}>
                Restart collector
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Desktop health</h2>
              <p>Read-only visibility into the local analytics store.</p>
            </div>
          </div>
          <div className="stack-list">
            <div className="status-tile">
              <span>Sample count</span>
              <strong>{health?.sampleCount ?? "Unavailable"}</strong>
            </div>
            <div className="status-tile">
              <span>Latest sample</span>
              <strong>
                {health?.latestSampleAt
                  ? formatTimestamp(health.latestSampleAt, true)
                  : "Unavailable"}
              </strong>
            </div>
            <div className="status-tile">
              <span>Connection</span>
              <strong>{health?.status ?? "Unavailable"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Productive applications</h2>
            <p>Choose productive labels separately for apps and browser windows.</p>
          </div>
        </div>
        <div className="toggle-grid source-grid">
          <button
            className={`button ${applicationSource === "app" ? "primary" : "secondary"}`}
            type="button"
            onClick={() => setApplicationSource("app")}
          >
            Apps
          </button>
          <button
            className={`button ${applicationSource === "browser" ? "primary" : "secondary"}`}
            type="button"
            onClick={() => setApplicationSource("browser")}
          >
            Browser
          </button>
        </div>
        <div className="toggle-list">
          {visibleApplications.map((application) => {
            const checked = preferences.productiveTitles.includes(application.windowTitle)
            return (
              <div
                key={`${application.appClass}-${application.windowTitle}`}
                className="toggle-row"
              >
                <div>
                  <strong>{application.windowTitle}</strong>
                  <p>{getApplicationSourceLabel(application.appClass)}</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const nextChecked = event.currentTarget.checked
                      updatePreferences((current) => ({
                        ...current,
                        productiveTitles: nextChecked
                          ? [...new Set([...current.productiveTitles, application.windowTitle])]
                          : current.productiveTitles.filter(
                              (candidate) => candidate !== application.windowTitle
                            ),
                      }))
                    }}
                  />
                  <span />
                </label>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function App() {
  const { preferences, updatePreferences } = useDesktopPreferences()
  const [page, setPage] = React.useState<DesktopPage>("overview")
  const [rangeOverride, setRangeOverride] = React.useState<RangeKey | null>(null)
  const [refreshVersion, setRefreshVersion] = React.useState(0)
  const [autostartEnabled, setAutostartEnabled] = React.useState(false)
  const range = rangeOverride ?? preferences.defaultRange
  const resolvedTheme = useResolvedTheme(preferences.theme)

  const health = useDesktopQuery<HealthData>(() => getHealth(), [refreshVersion])
  const collectorStatus = useDesktopQuery<CollectorStatus>(
    () => getCollectorStatus(),
    [refreshVersion]
  )
  const autostart = useDesktopQuery(() => getAutostartStatus(), [refreshVersion])

  React.useEffect(() => {
    if (autostart.data) {
      setAutostartEnabled(autostart.data.enabled)
    }
  }, [autostart.data])

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
    document.documentElement.style.fontSize = FONT_SIZE_PIXELS[preferences.fontSize]
    document.documentElement.style.setProperty(
      "--desktop-sidebar-width",
      SIDEBAR_WIDTH_PIXELS[preferences.sidebarWidth]
    )
    return () => {
      document.documentElement.style.removeProperty("font-size")
      document.documentElement.style.removeProperty("--desktop-sidebar-width")
    }
  }, [preferences.fontSize, preferences.sidebarWidth, resolvedTheme])

  React.useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen("hyprtrack://refresh", () => {
      setRefreshVersion((version) => version + 1)
    }).then((cleanup) => {
      unlisten = cleanup
    })
    return () => {
      unlisten?.()
    }
  }, [])

  async function runCollectorAction(action: "start" | "stop" | "restart") {
    if (action === "start") {
      await startCollector()
    } else if (action === "stop") {
      await stopCollector()
    } else {
      await restartCollector()
    }
    setRefreshVersion((version) => version + 1)
  }

  async function toggleAutostart(enabled: boolean) {
    const next = await setAutostart(enabled)
    setAutostartEnabled(next.enabled)
  }

  return (
    <div className="desktop-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark">HT</span>
          <div>
            <strong>HyprTrack</strong>
            <p>Local activity intelligence</p>
          </div>
        </div>
        <nav className="nav-stack">
          {PAGES.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              type="button"
              onClick={() => setPage(item.id)}
              aria-label={item.label}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="status-dot-row">
            <span
              className={`status-dot ${
                collectorStatus.data?.state === "running_app" ||
                collectorStatus.data?.state === "running_external"
                  ? "online"
                  : "offline"
              }`}
            />
            <div>
              <strong>
                {collectorStatus.data?.state === "running_app" ||
                collectorStatus.data?.state === "running_external"
                  ? "Tracking data ready"
                  : "Tracker idle"}
              </strong>
              <p>Read-only local SQLite</p>
            </div>
          </div>
          {collectorStatus.data?.latestSampleAt ? (
            <small>
              Latest activity {formatTimestamp(collectorStatus.data.latestSampleAt)}
            </small>
          ) : null}
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{PAGES.find((item) => item.id === page)?.description}</p>
            <h2>{PAGES.find((item) => item.id === page)?.label}</h2>
          </div>
          <div className="topbar-actions">
            {page === "settings" ? null : (
              <div className="segmented-control">
                {(["today", "7d", "30d"] as const).map((option) => (
                  <button
                    key={option}
                    className={range === option ? "active" : ""}
                    type="button"
                    onClick={() => setRangeOverride(option)}
                  >
                    {option === "today" ? "Today" : option}
                  </button>
                ))}
              </div>
            )}
            <button
              className="button secondary"
              type="button"
              onClick={() => setRefreshVersion((version) => version + 1)}
            >
              Refresh
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                updatePreferences({
                  theme:
                    preferences.theme === "dark"
                      ? "light"
                      : preferences.theme === "light"
                        ? "system"
                        : "dark",
                })
              }
            >
              Theme: {preferences.theme}
            </button>
          </div>
        </header>

        <section className="status-strip">
          <div className="status-chip">
            <span>Collector</span>
            <strong>{collectorStatus.data?.message ?? "Checking…"}</strong>
          </div>
          <div className="status-chip">
            <span>Samples</span>
            <strong>{health.data?.sampleCount ?? "…"}</strong>
          </div>
          <div className="status-chip">
            <span>Autostart</span>
            <strong>{autostartEnabled ? "Enabled" : "Disabled"}</strong>
          </div>
        </section>

        <section className="content-area">
          {page === "overview" ? (
            <OverviewPage
              range={range}
              refreshVersion={refreshVersion}
              productiveTitles={preferences.productiveTitles}
            />
          ) : null}
          {page === "activity" ? (
            <ActivityPage
              range={range}
              refreshVersion={refreshVersion}
              compact={preferences.tableDensity === "compact"}
            />
          ) : null}
          {page === "applications" ? (
            <ApplicationsPage range={range} refreshVersion={refreshVersion} />
          ) : null}
          {page === "settings" ? (
            <SettingsPage
              preferences={preferences}
              updatePreferences={updatePreferences}
              collectorStatus={collectorStatus.data}
              health={health.data}
              autostartEnabled={autostartEnabled}
              onToggleAutostart={toggleAutostart}
              onCollectorAction={runCollectorAction}
            />
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default App

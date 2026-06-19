import * as React from "react"
import {
  Activity01Icon,
  Analytics01Icon,
  Home01Icon,
  KeyboardIcon,
  MapsEditingIcon,
  Moon02Icon,
  RefreshIcon,
  Settings01Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { listen } from "@tauri-apps/api/event"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import "./App.css"
import { HyprTrackMark } from "./components/hyprtrack-mark"
import { KeybindingsPage } from "./components/keybindings-page"
import { MappingsPage } from "./components/mappings-page"
import { useDesktopQuery } from "./hooks/use-desktop-query"
import {
  getActivity,
  getApplications,
  getOverview,
} from "./lib/desktop-api"
import {
  getApplicationSource,
  getApplicationSourceLabel,
  type ApplicationSource,
} from "./lib/application-source"
import {
  shortcutFromKeyboardEvent,
  type ShortcutActionId,
} from "./lib/keybindings"
import type { MappingRule } from "./lib/mappings"
import {
  calculateProductiveMinutes,
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
  DesktopPage,
  OverviewData,
  RangeKey,
} from "./lib/types"

const AUTO_REFRESH_INTERVAL_MS = 60_000

const PAGES: Array<{
  id: DesktopPage
  label: string
  icon: typeof Home01Icon
}> = [
  { id: "overview", label: "Overview", icon: Home01Icon },
  { id: "applications", label: "Applications", icon: Analytics01Icon },
  { id: "activity", label: "Activity", icon: Activity01Icon },
  { id: "mappings", label: "Mappings", icon: MapsEditingIcon },
  { id: "settings", label: "Settings", icon: Settings01Icon },
]

const KEYBINDINGS_PAGE = {
  id: "keybindings" as const,
  label: "Keybindings",
  icon: KeyboardIcon,
}

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
          : { ...current, ...update, version: 2 as const }
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

function LastHourCoverageBox({
  coverage,
}: {
  coverage: ActivityData["lastHourCoverage"]
}) {
  return (
    <section className="panel coverage-panel">
      <div className="panel-header">
        <div>
          <h2>Last 60 minutes</h2>
          <p>
            {formatTimestamp(coverage.windowStart, true)} to{" "}
            {formatTimestamp(coverage.windowEnd, true)}
          </p>
        </div>
        <span className="pill">{coverage.coveragePercent}% covered</span>
      </div>
      <div className="coverage-grid">
        <Metric
          label="Tracked"
          value={`${Math.round(coverage.trackedMinutes)} minutes tracked`}
          detail="Confirmed by saved last-seen checkpoints"
        />
        <Metric
          label="Untracked"
          value={`${Math.round(coverage.untrackedMinutes)} minutes untracked`}
          detail="No recorded collector coverage"
        />
      </div>
    </section>
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

function RangeControl({
  range,
  onChange,
}: {
  range: RangeKey
  onChange: (range: RangeKey) => void
}) {
  return (
    <div className="segmented-control" aria-label="Dashboard date range">
      {(["today", "7d", "30d"] as const).map((option) => (
        <button
          key={option}
          className={range === option ? "active" : ""}
          type="button"
          onClick={() => onChange(option)}
        >
          {option === "today" ? "Today" : option === "7d" ? "7 days" : "30 days"}
        </button>
      ))}
    </div>
  )
}

function AutoRefreshControl({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const labelId = React.useId()

  return (
    <div className="auto-refresh-control">
      <span id={labelId}>
        <span aria-hidden="true" className="auto-refresh-label">
          Auto 1m
        </span>
        <span className="sr-only">Refresh dashboard every minute</span>
      </span>
      <label className="switch compact">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          aria-labelledby={labelId}
        />
        <span />
      </label>
    </div>
  )
}

function ThemeIconToggle({
  isDark,
  onToggle,
}: {
  isDark: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="button icon-button theme-icon-button"
      type="button"
      aria-label={isDark ? "Use light theme" : "Use dark theme"}
      onClick={onToggle}
      title={isDark ? "Use light theme" : "Use dark theme"}
    >
      <span className="theme-icon-frame">
        <HugeiconsIcon
          key={isDark ? "sun" : "moon"}
          icon={isDark ? Sun03Icon : Moon02Icon}
          strokeWidth={1.8}
          className="theme-icon"
        />
      </span>
    </button>
  )
}

function OverviewPage({
  range,
  refreshVersion,
  productiveTitles,
  mappingRules,
}: {
  range: RangeKey
  refreshVersion: number
  productiveTitles: string[]
  mappingRules: MappingRule[]
}) {
  const query = useDesktopQuery<OverviewData>(
    () => getOverview(range, mappingRules),
    [range, refreshVersion, mappingRules]
  )

  if (query.loading && !query.data) {
    return (
      <EmptyState
        title="Loading overview"
        description="Reading local activity analytics."
      />
    )
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
            Read-only analytics from your HyprTrack collector with the same
            dashboard language as the web app.
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
          detail={`${Math.round(
            (productiveMinutes / query.data.trackedMinutes) * 100
          )}% of tracked time`}
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
          value={`${query.data.streakDays} ${
            query.data.streakDays === 1 ? "day" : "days"
          }`}
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
            <AreaChart
              data={query.data.timeline}
              margin={{ top: 16, right: 8, left: -24, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="hyprtrackArea"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--chart-3)"
                    stopOpacity={0.34}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--chart-3)"
                    stopOpacity={0.03}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={32}
              />
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

      <section className="panel full-width-panel">
          <div className="panel-header">
            <div>
              <h2>Application usage</h2>
              <p>Ranked by tracked duration.</p>
            </div>
          </div>
          <div className="stack-list">
            {query.data.applications.slice(0, 6).map((application, index) => (
              <div
                key={`${application.appClass}-${application.windowTitle}`}
                className="usage-row"
              >
                <span className="usage-rank">
                  {String(index + 1).padStart(2, "0")}
                </span>
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
      </section>
    </div>
  )
}

function ActivityPage({
  range,
  refreshVersion,
  compact,
  mappingRules,
}: {
  range: RangeKey
  refreshVersion: number
  compact: boolean
  mappingRules: MappingRule[]
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
        mappingRules,
      }),
    [range, app, deferredSearch, page, refreshVersion, mappingRules]
  )

  React.useEffect(() => {
    setPageState((current) =>
      current.filterKey === filterKey ? current : { filterKey, page: 1 }
    )
  }, [filterKey])

  if (query.loading && !query.data) {
    return (
      <EmptyState
        title="Loading activity"
        description="Grouping tracked sessions."
      />
    )
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
      <LastHourCoverageBox coverage={query.data.lastHourCoverage} />
      <section className="panel filters-panel">
        <div className="panel-header">
          <div>
            <h2>Activity</h2>
            <p>Inspect grouped focus sessions without exposing raw database rows.</p>
          </div>
          <span className="pill">{query.data.range.label}</span>
        </div>
        <div className="filters-row">
          <input
            className="input"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search application class or title"
            data-page-search
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
          <div className="table-scroll">
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
                <tr
                  key={`${session.startAt}-${session.appClass}-${session.windowTitle}`}
                >
                  <td>{session.windowTitle}</td>
                  <td>{session.appClass}</td>
                  <td>{formatTimestamp(session.startAt, true)}</td>
                  <td>{formatTimestamp(session.endAt, true)}</td>
                  <td>{formatDuration(session.durationMinutes)}</td>
                  <td>{session.sampleCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}

      <div className="pager">
        <span>
          Page {query.data.pagination.page} of{" "}
          {query.data.pagination.totalPages}
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
  mappingRules,
}: {
  range: RangeKey
  refreshVersion: number
  mappingRules: MappingRule[]
}) {
  const [search, setSearch] = React.useState("")
  const deferredSearch = React.useDeferredValue(search)
  const query = useDesktopQuery<ApplicationsData>(
    () => getApplications(range, mappingRules, deferredSearch || undefined),
    [range, deferredSearch, refreshVersion, mappingRules]
  )

  if (query.loading && !query.data) {
    return (
      <EmptyState
        title="Loading applications"
        description="Ranking normalized labels."
      />
    )
  }
  if (query.error && !query.data) {
    return <ErrorState message={query.error} />
  }
  if (!query.data) {
    return null
  }

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
            data-page-search
          />
          <span className="subtle-copy">
            {query.data.items.length} normalized{" "}
            {query.data.items.length === 1 ? "label" : "labels"}
          </span>
        </div>
      </section>

      <section className="panel full-width-panel">
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Application</th>
              <th>Class</th>
              <th>Usage</th>
              <th>Sessions</th>
              <th>Last active</th>
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
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>
    </div>
  )
}

function SettingsPage({
  preferences,
  updatePreferences,
}: {
  preferences: DesktopPreferences
  updatePreferences: (
    update:
      | Partial<DesktopPreferences>
      | ((current: DesktopPreferences) => DesktopPreferences)
  ) => void
}) {
  const [applicationSource, setApplicationSource] =
    React.useState<ApplicationSource>("app")
  const applications = useDesktopQuery<ApplicationsData>(
    () => getApplications("30d", preferences.mappingRules),
    [preferences.mappingRules]
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

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Collector</h2>
            <p>
              HyprTrack exports a Python collector for Hyprland autostart and
              reads the SQLite database it writes beside the script.
            </p>
          </div>
          <span className="pill">Python</span>
        </div>
        <div className="collector-details">
          <div>
            <span>Script</span>
            <strong>~/.local/bin/hyprtrack/collector/hyprtrack-monitor.py</strong>
          </div>
          <div>
            <span>Database</span>
            <strong>~/.local/bin/hyprtrack/collector/hyprtrack.db</strong>
          </div>
          <div>
            <span>Autostart</span>
            <strong>
              hl.exec_cmd("$HOME/.local/bin/hyprtrack/collector/hyprtrack-monitor.py")
            </strong>
          </div>
        </div>
        <p className="collector-message">
          Add the autostart command to your Hyprland exec config to keep
          tracking alive after login.
        </p>
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
            className={`button ${
              applicationSource === "app" ? "primary" : "secondary"
            }`}
            type="button"
            onClick={() => setApplicationSource("app")}
          >
            Apps
          </button>
          <button
            className={`button ${
              applicationSource === "browser" ? "primary" : "secondary"
            }`}
            type="button"
            onClick={() => setApplicationSource("browser")}
          >
            Browser
          </button>
        </div>
        <div className="toggle-list productive-app-list">
          {visibleApplications.map((application) => {
            const checked = preferences.productiveTitles.includes(
              application.windowTitle
            )
            return (
              <div
                key={`${application.appClass}-${application.windowTitle}`}
                className="toggle-row productive-app-row"
              >
                <div className="productive-app-copy">
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
                          ? [
                              ...new Set([
                                ...current.productiveTitles,
                                application.windowTitle,
                              ]),
                            ]
                          : current.productiveTitles.filter(
                              (candidate) =>
                                candidate !== application.windowTitle
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
  const [refreshRequestedAt, setRefreshRequestedAt] =
    React.useState<Date | null>(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(true)
  const contentAreaRef = React.useRef<HTMLElement>(null)
  const range = rangeOverride ?? preferences.defaultRange
  const resolvedTheme = useResolvedTheme(preferences.theme)

  React.useEffect(() => {
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0
    }
  }, [page])

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

  const requestRefresh = React.useCallback(() => {
    setRefreshRequestedAt(new Date())
    setRefreshVersion((version) => version + 1)
  }, [])

  const runShortcutAction = React.useCallback(
    (action: ShortcutActionId) => {
      switch (action) {
        case "navigate.overview":
          setPage("overview")
          return
        case "navigate.applications":
          setPage("applications")
          return
        case "navigate.activity":
          setPage("activity")
          return
        case "navigate.mappings":
          setPage("mappings")
          return
        case "navigate.settings":
          setPage("settings")
          return
        case "navigate.keybindings":
          setPage("keybindings")
          return
        case "dashboard.refresh":
          requestRefresh()
          return
        case "theme.toggle":
          updatePreferences({
            theme: resolvedTheme === "dark" ? "light" : "dark",
          })
          return
        case "autoRefresh.toggle":
          setAutoRefreshEnabled((enabled) => !enabled)
          return
        case "range.today":
          setRangeOverride("today")
          return
        case "range.7d":
          setRangeOverride("7d")
          return
        case "range.30d":
          setRangeOverride("30d")
          return
        case "search.focus":
          window.requestAnimationFrame(() => {
            document
              .querySelector<HTMLInputElement>("[data-page-search]")
              ?.focus()
          })
      }
    },
    [requestRefresh, resolvedTheme, updatePreferences]
  )

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        document.activeElement?.getAttribute("data-shortcut-capture") === "true"
      ) {
        return
      }
      const shortcut = shortcutFromKeyboardEvent(event)
      if (!shortcut) {
        return
      }
      const binding = preferences.keybindings.find(
        (candidate) =>
          candidate.shortcut.toLocaleLowerCase() === shortcut.toLocaleLowerCase()
      )
      if (!binding) {
        return
      }
      event.preventDefault()
      runShortcutAction(binding.action)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [preferences.keybindings, runShortcutAction])

  React.useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen("hyprtrack://refresh", () => {
      requestRefresh()
    }).then((cleanup) => {
      unlisten = cleanup
    })
    return () => {
      unlisten?.()
    }
  }, [requestRefresh])

  React.useEffect(() => {
    if (
      !autoRefreshEnabled ||
      !["overview", "applications", "activity"].includes(page)
    ) {
      return
    }

    const interval = window.setInterval(requestRefresh, AUTO_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [autoRefreshEnabled, page, requestRefresh])

  const pageTitle =
    PAGES.find((item) => item.id === page)?.label ??
    (page === "keybindings" ? KEYBINDINGS_PAGE.label : "HyprTrack")
  const isDataPage = ["overview", "applications", "activity"].includes(page)

  return (
    <div className="desktop-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <HyprTrackMark className="brand-mark" title="HyprTrack" />
          <div>
            <strong>HyprTrack</strong>
          </div>
        </div>
        <nav className="nav-stack" aria-label="Primary navigation">
          {PAGES.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              type="button"
              onClick={() => setPage(item.id)}
              aria-label={item.label}
            >
              <HugeiconsIcon icon={item.icon} strokeWidth={1.8} />
              <strong>{item.label}</strong>
            </button>
          ))}
        </nav>
        <nav className="nav-stack utility-nav" aria-label="Utility navigation">
          <button
            className={`nav-item ${page === "keybindings" ? "active" : ""}`}
            type="button"
            onClick={() => setPage("keybindings")}
            aria-label="Keybindings"
          >
            <HugeiconsIcon icon={KEYBINDINGS_PAGE.icon} strokeWidth={1.8} />
            <strong>Keybindings</strong>
          </button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <h2>{pageTitle}</h2>
          <div className="topbar-actions">
            {isDataPage ? (
              <>
                <RangeControl range={range} onChange={setRangeOverride} />
                <AutoRefreshControl
                  enabled={autoRefreshEnabled}
                  onChange={setAutoRefreshEnabled}
                />
              </>
            ) : null}
            {isDataPage ? (
              <button
                className="button secondary header-button"
                type="button"
                onClick={requestRefresh}
                title={
                  refreshRequestedAt
                    ? `Last requested ${refreshRequestedAt.toLocaleTimeString()}`
                    : "Refresh dashboard data"
                }
              >
                <HugeiconsIcon
                  icon={RefreshIcon}
                  data-icon="inline-start"
                  strokeWidth={1.8}
                />
                <span className="header-button-label">Refresh</span>
              </button>
            ) : null}
            <ThemeIconToggle
              isDark={resolvedTheme === "dark"}
              onToggle={() =>
                updatePreferences({
                  theme: resolvedTheme === "dark" ? "light" : "dark",
                })
              }
            />
          </div>
        </header>

        <section className="content-area" ref={contentAreaRef}>
          {page === "overview" ? (
            <OverviewPage
              range={range}
              refreshVersion={refreshVersion}
              productiveTitles={preferences.productiveTitles}
              mappingRules={preferences.mappingRules}
            />
          ) : null}
          {page === "activity" ? (
            <ActivityPage
              range={range}
              refreshVersion={refreshVersion}
              compact={preferences.tableDensity === "compact"}
              mappingRules={preferences.mappingRules}
            />
          ) : null}
          {page === "applications" ? (
            <ApplicationsPage
              range={range}
              refreshVersion={refreshVersion}
              mappingRules={preferences.mappingRules}
            />
          ) : null}
          {page === "mappings" ? (
            <MappingsPage
              rules={preferences.mappingRules}
              onSave={(mappingRules) => updatePreferences({ mappingRules })}
            />
          ) : null}
          {page === "settings" ? (
            <SettingsPage
              preferences={preferences}
              updatePreferences={updatePreferences}
            />
          ) : null}
          {page === "keybindings" ? (
            <KeybindingsPage
              bindings={preferences.keybindings}
              onSave={(keybindings) => updatePreferences({ keybindings })}
            />
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default App

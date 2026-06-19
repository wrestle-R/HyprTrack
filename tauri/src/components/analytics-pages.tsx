import type { CSSProperties } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { useDesktopQuery } from "../hooks/use-desktop-query"
import { getInsights, getOverview } from "../lib/desktop-api"
import {
  calculateProductiveMinutes,
  formatDuration,
  formatTimestamp,
} from "../lib/format"
import type { MappingRule } from "../lib/mappings"
import type {
  ComparisonValue,
  DailyInsightPoint,
  InsightsData,
  OverviewData,
  RangeKey,
  TimelinePoint,
} from "../lib/types"

type AnalyticsPageProps = {
  range: RangeKey
  refreshVersion: number
  focusThresholdMinutes: number
  mappingRules: MappingRule[]
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

export function ActivityTooltip({
  active,
  payload,
  average,
}: {
  active?: boolean
  payload?: Array<{ payload?: TimelinePoint; value?: number }>
  average: number
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) {
    return null
  }
  const difference = point.minutes - average
  const comparison =
    Math.abs(difference) < 0.01
      ? "At the range average"
      : `${formatDuration(Math.abs(difference))} ${
          difference > 0 ? "above" : "below"
        } average`

  return (
    <div className="chart-tooltip">
      <span>{point.label}</span>
      <strong>{formatDuration(point.minutes)}</strong>
      <small>{comparison}</small>
    </div>
  )
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: DailyInsightPoint }>
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) {
    return null
  }

  return (
    <div className="chart-tooltip">
      <span>{point.label}</span>
      <div className="tooltip-pair">
        <i className="tooltip-swatch tracked" />
        <small>Tracked</small>
        <strong>{formatDuration(point.trackedMinutes)}</strong>
      </div>
      <div className="tooltip-pair">
        <i className="tooltip-swatch focused" />
        <small>Focused</small>
        <strong>{formatDuration(point.focusedMinutes)}</strong>
      </div>
    </div>
  )
}

function ComparisonCard({
  label,
  comparison,
  formatValue,
  lowerIsBetter = false,
}: {
  label: string
  comparison: ComparisonValue
  formatValue: (value: number) => string
  lowerIsBetter?: boolean
}) {
  const change = comparison.percentChange
  const favorable =
    change === null || change === 0
      ? null
      : lowerIsBetter
        ? change < 0
        : change > 0

  return (
    <div className="comparison-card">
      <span>{label}</span>
      <strong>{formatValue(comparison.current)}</strong>
      <div
        className={`comparison-delta ${
          favorable === null ? "neutral" : favorable ? "positive" : "negative"
        }`}
      >
        {change === null
          ? "No prior baseline"
          : `${change > 0 ? "+" : ""}${Math.round(change)}% vs previous`}
      </div>
      <small>Previous: {formatValue(comparison.previous)}</small>
    </div>
  )
}

function formatHour(hour: number) {
  if (hour === 0) return "12 AM"
  if (hour === 12) return "12 PM"
  return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`
}

function formatHourWindow(hour: number) {
  const nextHour = (hour + 1) % 24
  const start = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const end = nextHour === 0 ? 12 : nextHour > 12 ? nextHour - 12 : nextHour
  const period = hour >= 12 && hour < 23 ? "PM" : nextHour === 0 ? "AM" : "AM"
  return `${start}–${end} ${period}`
}

export function RhythmRail({ cells }: { cells: InsightsData["rhythm"] }) {
  const maxTracked = Math.max(1, ...cells.map((cell) => cell.trackedMinutes))
  const peak = cells.reduce<(typeof cells)[number] | null>(
    (current, cell) =>
      current === null || cell.trackedMinutes > current.trackedMinutes
        ? cell
        : current,
    null
  )
  const rows = [
    ...new Map(
      cells.map((cell) => [
        cell.dayIndex,
        {
          label: cell.dayLabel,
          cells: cells.filter((candidate) => candidate.dayIndex === cell.dayIndex),
        },
      ])
    ).values(),
  ]

  return (
    <div className="rhythm-rail">
      <div className="rhythm-rail-summary">
        <div>
          <span>Peak window</span>
          <strong>
            {peak && peak.trackedMinutes > 0
              ? formatHourWindow(peak.hour)
              : "Not enough activity"}
          </strong>
        </div>
        <div className="rhythm-scale" aria-label="Activity intensity scale">
          <span>Quiet</span>
          <i />
          <span>Active</span>
        </div>
      </div>
      <div className="rhythm-axis" aria-hidden="true">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
      </div>
      <div className="rhythm-rows">
        {rows.map((row) => (
          <div className="rhythm-row" key={row.label}>
            <strong>{row.label}</strong>
            <div className="rhythm-band">
              {row.cells.map((cell) => {
                const strength = cell.trackedMinutes / maxTracked
                const label = `${cell.dayLabel}, ${formatHour(
                  cell.hour
                )}: ${formatDuration(
                  cell.trackedMinutes
                )} tracked, ${formatDuration(cell.focusedMinutes)} focused`
                return (
                  <span
                    className="rhythm-segment"
                    key={`${cell.dayIndex}-${cell.hour}`}
                    tabIndex={0}
                    aria-label={label}
                    title={label}
                    style={{
                      "--rhythm-strength": `${Math.round(
                        Math.max(0.035, strength) * 86
                      )}%`,
                      "--rhythm-height": `${Math.round(34 + strength * 66)}%`,
                    } as CSSProperties}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function OverviewPage({
  range,
  refreshVersion,
  productiveTitles,
  focusThresholdMinutes,
  mappingRules,
}: AnalyticsPageProps & { productiveTitles: string[] }) {
  const query = useDesktopQuery<OverviewData>(
    () => getOverview(range, focusThresholdMinutes, mappingRules),
    [range, refreshVersion, focusThresholdMinutes, mappingRules]
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

  const data = query.data
  const productiveMinutes = calculateProductiveMinutes(
    data.applications,
    productiveTitles
  )
  const average =
    data.timeline.length === 0
      ? 0
      : data.timeline.reduce((total, point) => total + point.minutes, 0) /
        data.timeline.length
  const peak = data.timeline.reduce<TimelinePoint | null>(
    (current, point) =>
      current === null || point.minutes > current.minutes ? point : current,
    null
  )

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">{data.range.label}</p>
          <h1>Local activity intelligence</h1>
          <p className="hero-copy">
            Private analytics for understanding when your attention holds and
            where your day changes shape.
          </p>
        </div>
        <div className="hero-meta">
          <span>Latest sample</span>
          <strong>
            {data.latestSampleAt
              ? formatTimestamp(data.latestSampleAt, true)
              : "Unavailable"}
          </strong>
        </div>
      </section>

      <section className="metrics-grid">
        <Metric
          label="Tracked time"
          value={formatDuration(data.trackedMinutes)}
          detail="Measured from completed activity intervals"
        />
        <Metric
          label="Productive time"
          value={formatDuration(productiveMinutes)}
          detail={`${Math.round(
            (productiveMinutes / data.trackedMinutes) * 100
          )}% of tracked time`}
        />
        <Metric
          label="Top application"
          value={data.topApplication?.windowTitle ?? "None"}
          detail={
            data.topApplication
              ? `${formatDuration(data.topApplication.minutes)} tracked`
              : "No activity"
          }
        />
        <Metric
          label="Active streak"
          value={`${data.streakDays} ${data.streakDays === 1 ? "day" : "days"}`}
          detail="Consecutive days with tracked activity"
        />
      </section>

      <section className="chart-panel panel rhythm-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Temporal pattern</p>
            <h2>Activity rhythm</h2>
            <p>Tracked minutes across the selected range.</p>
          </div>
          <div className="chart-summary">
            <span>Average per interval</span>
            <strong>{formatDuration(average)}</strong>
          </div>
        </div>
        <div
          className="chart-frame"
          role="img"
          aria-label="Activity rhythm line chart"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 900, height: 336 }}
          >
            <AreaChart
              data={data.timeline}
              margin={{ top: 28, right: 24, left: -12, bottom: 0 }}
            >
              <defs>
                <linearGradient id="activityArea" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--primary)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="72%"
                    stopColor="var(--primary)"
                    stopOpacity={0.06}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--primary)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="2 7"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={range === "30d" ? 34 : 24}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(value) => `${Math.round(value)}m`}
              />
              <ReferenceLine
                y={average}
                stroke="var(--signal)"
                strokeDasharray="5 6"
                label={{
                  value: "Average",
                  position: "insideTopRight",
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                }}
              />
              {peak && peak.minutes > 0 ? (
                <ReferenceDot
                  x={peak.label}
                  y={peak.minutes}
                  r={5}
                  fill="var(--card)"
                  stroke="var(--primary)"
                  strokeWidth={3}
                  label={{
                    value: "Peak",
                    position: "top",
                    fill: "var(--foreground)",
                    fontSize: 11,
                  }}
                />
              ) : null}
              <Tooltip
                cursor={{
                  stroke: "var(--primary)",
                  strokeOpacity: 0.24,
                  strokeWidth: 1,
                }}
                content={<ActivityTooltip average={average} />}
              />
              <Area
                type="monotone"
                dataKey="minutes"
                stroke="var(--primary)"
                fill="url(#activityArea)"
                strokeWidth={3}
                activeDot={{
                  r: 6,
                  fill: "var(--card)",
                  stroke: "var(--primary)",
                  strokeWidth: 3,
                }}
                dot={false}
                animationDuration={650}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel focus-quality-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Attention continuity</p>
            <h2>Focus quality</h2>
            <p>
              Uninterrupted sessions lasting at least {focusThresholdMinutes}{" "}
              minutes.
            </p>
          </div>
          <div className="focus-score">
            <strong>{Math.round(data.focusQuality.continuityPercent)}%</strong>
            <span>continuity</span>
          </div>
        </div>
        <div className="focus-metrics-grid">
          <Metric
            label="Focused time"
            value={formatDuration(data.focusQuality.focusedMinutes)}
            detail="Time inside qualifying focus blocks"
          />
          <Metric
            label="Longest block"
            value={formatDuration(
              data.focusQuality.longestFocusedBlockMinutes
            )}
            detail="Longest uninterrupted session"
          />
          <Metric
            label="Average session"
            value={formatDuration(data.focusQuality.averageSessionMinutes)}
            detail="Across all grouped sessions"
          />
          <Metric
            label="Context switches"
            value={String(data.focusQuality.contextSwitches)}
            detail={`${data.focusQuality.switchesPerTrackedHour.toFixed(
              1
            )} per tracked hour`}
          />
        </div>
      </section>
    </div>
  )
}

export function InsightsPage({
  range,
  refreshVersion,
  focusThresholdMinutes,
  mappingRules,
}: AnalyticsPageProps) {
  const query = useDesktopQuery<InsightsData>(
    () => getInsights(range, focusThresholdMinutes, mappingRules),
    [range, refreshVersion, focusThresholdMinutes, mappingRules]
  )

  if (query.loading && !query.data) {
    return (
      <EmptyState
        title="Loading insights"
        description="Comparing your local activity periods."
      />
    )
  }
  if (query.error && !query.data) {
    return <ErrorState message={query.error} />
  }
  if (!query.data || query.data.comparisons.trackedMinutes.current === 0) {
    return (
      <EmptyState
        title="Not enough activity"
        description="Insights appear after activity has been recorded in this range."
      />
    )
  }

  const data = query.data

  return (
    <div className="page-stack">
      <section className="hero-panel insights-hero">
        <div>
          <p className="eyebrow">{data.range.label}</p>
          <h1>Patterns, not judgments</h1>
          <p className="hero-copy">
            Compare attention continuity, identify recurring hours, and see how
            sustained work differs from total activity.
          </p>
        </div>
        <div className="hero-meta">
          <span>Focus threshold</span>
          <strong>{focusThresholdMinutes} minutes</strong>
        </div>
      </section>

      <section className="comparison-grid">
        <ComparisonCard
          label="Tracked time"
          comparison={data.comparisons.trackedMinutes}
          formatValue={formatDuration}
        />
        <ComparisonCard
          label="Focus continuity"
          comparison={data.comparisons.focusContinuity}
          formatValue={(value) => `${Math.round(value)}%`}
        />
        <ComparisonCard
          label="Average session"
          comparison={data.comparisons.averageSessionMinutes}
          formatValue={formatDuration}
        />
        <ComparisonCard
          label="Switches per hour"
          comparison={data.comparisons.switchesPerTrackedHour}
          formatValue={(value) => value.toFixed(1)}
          lowerIsBetter
        />
      </section>

      <section className="panel heatmap-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Recurring windows</p>
            <h2>Weekly rhythm</h2>
            <p>Taller, warmer segments contain more tracked time.</p>
          </div>
        </div>
        <RhythmRail cells={data.rhythm} />
      </section>

      <section className="panel trend-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Continuity over time</p>
            <h2>Focus trend</h2>
            <p>Tracked time compared with qualifying focused time.</p>
          </div>
          <div className="chart-legend" aria-label="Chart legend">
            <span><i className="tracked" />Tracked</span>
            <span><i className="focused" />Focused</span>
          </div>
        </div>
        <div
          className="chart-frame insight-chart-frame"
          role="img"
          aria-label="Tracked and focused time trend chart"
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 900, height: 304 }}
          >
            <LineChart
              data={data.dailyTrend}
              margin={{ top: 16, right: 18, left: -12, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="2 7"
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={32}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={44}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                tickFormatter={(value) => `${Math.round(value)}m`}
              />
              <Tooltip content={<TrendTooltip />} />
              <Line
                type="monotone"
                dataKey="trackedMinutes"
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="focusedMinutes"
                stroke="var(--primary)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="highlight-grid">
        <Metric
          label="Peak working window"
          value={data.highlights.peakWorkingWindow ?? "Not enough history"}
          detail="Highest recurring tracked-time cell"
        />
        <Metric
          label="Strongest focus period"
          value={data.highlights.strongestFocusDay ?? "Not enough history"}
          detail="Most qualifying focus time"
        />
        <Metric
          label="Most fragmented day"
          value={data.highlights.mostFragmentedDay ?? "Not enough history"}
          detail="Most context switches within five minutes"
        />
        <Metric
          label="Longest focus block"
          value={formatDuration(
            data.highlights.longestFocusedBlockMinutes
          )}
          detail={`At least ${focusThresholdMinutes} minutes`}
        />
      </section>
    </div>
  )
}

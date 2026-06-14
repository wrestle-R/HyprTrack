"use client"

import {
  Activity01Icon,
  Analytics01Icon,
  Clock01Icon,
  FireIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { useDashboard } from "@/components/dashboard/dashboard-provider"
import {
  DashboardEmpty,
  DashboardError,
  DashboardSkeleton,
} from "@/components/dashboard/data-state"
import { PageHeading } from "@/components/dashboard/page-heading"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useDashboardQuery } from "@/hooks/use-dashboard-query"
import {
  calculateProductiveMinutes,
  formatDuration,
  formatTimestamp,
} from "@/lib/dashboard/format"
import type { OverviewData } from "@/lib/dashboard/types"

const chartConfig = {
  minutes: {
    label: "Tracked minutes",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: typeof Clock01Icon
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-border lg:border-r lg:pr-6 lg:last:border-r-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={icon} strokeWidth={1.8} />
        <span>{label}</span>
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

export function OverviewPage() {
  const { range, preferences } = useDashboard()
  const query = useDashboardQuery<OverviewData>(`/api/overview?range=${range}`)

  if (query.isLoading) {
    return <DashboardSkeleton />
  }
  if (query.error) {
    return <DashboardError message={query.error} />
  }
  if (!query.data || query.data.trackedMinutes === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeading
          title="Good evening, Russel"
          description="Here’s how your focus shaped up today."
        />
        <DashboardEmpty />
      </div>
    )
  }

  const productiveMinutes = calculateProductiveMinutes(
    query.data.applications,
    preferences.productiveTitles
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Good evening, Russel"
        description="Here’s how your focus shaped up today."
        badge={query.isRefreshing ? "Refreshing" : query.data.range.label}
      />

      <section
        aria-label="Overview metrics"
        className="grid gap-6 border-y py-6 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Metric
          icon={Clock01Icon}
          label="Tracked time"
          value={formatDuration(query.data.trackedMinutes)}
          detail="Measured from completed activity intervals"
        />
        <Metric
          icon={Activity01Icon}
          label="Productive time"
          value={formatDuration(productiveMinutes)}
          detail={`${Math.round(
            (productiveMinutes / query.data.trackedMinutes) * 100
          )}% of tracked time`}
        />
        <Metric
          icon={Analytics01Icon}
          label="Top application"
          value={query.data.topApplication?.windowTitle ?? "None"}
          detail={
            query.data.topApplication
              ? `${formatDuration(query.data.topApplication.minutes)} tracked`
              : "No activity"
          }
        />
        <Metric
          icon={FireIcon}
          label="Active streak"
          value={`${query.data.streakDays} ${
            query.data.streakDays === 1 ? "day" : "days"
          }`}
          detail="Consecutive days with tracked activity"
        />
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Activity rhythm
          </h2>
          <p className="text-xs text-muted-foreground">
            Minutes captured across the selected range.
          </p>
        </div>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[320px] w-full"
        >
          <AreaChart
            data={query.data.timeline}
            margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-minutes)"
                  stopOpacity={0.28}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-minutes)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={12}
              interval="preserveStartEnd"
              minTickGap={36}
            />
            <YAxis allowDecimals tickLine={false} axisLine={false} width={34} />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              dataKey="minutes"
              type="monotone"
              fill="url(#activityFill)"
              stroke="var(--color-minutes)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Application usage</CardTitle>
            <CardDescription>Ranked by tracked duration.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {query.data.applications.slice(0, 6).map((application, index) => (
              <div key={`${application.appClass}-${application.windowTitle}`}>
                <div className="mb-2 flex items-center gap-3">
                  <span className="w-5 text-xs text-muted-foreground tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium">
                        {application.windowTitle}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDuration(application.minutes)}
                      </span>
                    </div>
                    <p className="text-[0.65rem] text-muted-foreground">
                      {application.appClass} · {application.sessionCount}{" "}
                      {application.sessionCount === 1 ? "session" : "sessions"}
                    </p>
                  </div>
                </div>
                <div className="ml-8 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-[width]"
                    style={{ width: `${application.share}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Consecutive matching activity intervals are grouped into sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.recentSessions.map((session) => (
                  <TableRow
                    key={`${session.startAt}-${session.appClass}-${session.windowTitle}`}
                  >
                    <TableCell className="max-w-52 truncate font-medium">
                      {session.windowTitle}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{session.appClass}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {formatTimestamp(session.startAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDuration(session.durationMinutes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {query.updatedAt ? (
        <p className="text-right text-[0.65rem] text-muted-foreground">
          Loaded {query.updatedAt.toLocaleTimeString()}
        </p>
      ) : null}
    </div>
  )
}

"use client"

import {
  Database01Icon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"

import { useDashboard } from "@/components/dashboard/dashboard-provider"
import {
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
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useDashboardQuery } from "@/hooks/use-dashboard-query"
import { formatTimestamp } from "@/lib/dashboard/format"
import type {
  ApplicationsData,
  HealthData,
  RangeKey,
} from "@/lib/dashboard/types"

export function SettingsPage() {
  const { setTheme } = useTheme()
  const {
    preferences,
    updatePreferences,
    setRange,
  } = useDashboard()
  const health = useDashboardQuery<HealthData>("/api/health")
  const applications = useDashboardQuery<ApplicationsData>(
    "/api/applications?range=30d"
  )

  if (health.isLoading || applications.isLoading) {
    return <DashboardSkeleton />
  }
  if (health.error) {
    return <DashboardError message={health.error} />
  }

  const availableTitles = applications.data?.items.map(
    (application) => application.windowTitle
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Settings"
        description="Preferences stay in this browser and never modify tracked history."
        badge="Local only"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Choose the theme used by the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToggleGroup
              value={[preferences.theme]}
              onValueChange={(values) => {
                const theme = values[0] as
                  | "system"
                  | "light"
                  | "dark"
                  | undefined
                if (!theme) {
                  return
                }
                setTheme(theme)
                updatePreferences({ theme })
              }}
              variant="outline"
              spacing={0}
              aria-label="Dashboard theme"
            >
              <ToggleGroupItem value="system">System</ToggleGroupItem>
              <ToggleGroupItem value="light">
                <HugeiconsIcon icon={Sun03Icon} data-icon="inline-start" />
                Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark">
                <HugeiconsIcon icon={Moon02Icon} data-icon="inline-start" />
                Dark
              </ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Default date range</CardTitle>
            <CardDescription>
              Applied when the dashboard opens in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToggleGroup
              value={[preferences.defaultRange]}
              onValueChange={(values) => {
                const range = values[0] as RangeKey | undefined
                if (!range) {
                  return
                }
                updatePreferences({ defaultRange: range })
                setRange(range)
              }}
              variant="outline"
              spacing={0}
              aria-label="Default date range"
            >
              <ToggleGroupItem value="today">Today</ToggleGroupItem>
              <ToggleGroupItem value="7d">7 days</ToggleGroupItem>
              <ToggleGroupItem value="30d">30 days</ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Table density</CardTitle>
            <CardDescription>
              Control how much activity fits on screen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToggleGroup
              value={[preferences.tableDensity]}
              onValueChange={(values) => {
                const density = values[0] as
                  | "compact"
                  | "comfortable"
                  | undefined
                if (density) {
                  updatePreferences({ tableDensity: density })
                }
              }}
              variant="outline"
              spacing={0}
              aria-label="Table density"
            >
              <ToggleGroupItem value="comfortable">
                Comfortable
              </ToggleGroupItem>
              <ToggleGroupItem value="compact">Compact</ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Database health</CardTitle>
            <CardDescription>
              The dashboard has read-only access to local activity data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
              <HugeiconsIcon icon={Database01Icon} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium">SQLite connected</p>
                <Badge variant="secondary">Read only</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {health.data?.sampleCount ?? 0} activity records
                {health.data?.latestSampleAt
                  ? ` · latest ${formatTimestamp(
                      health.data.latestSampleAt,
                      true
                    )}`
                  : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Productive applications</CardTitle>
          <CardDescription>
            Selected normalized window titles count toward productive time.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {applications.error ? (
            <DashboardError message={applications.error} />
          ) : availableTitles?.length ? (
            availableTitles.map((title) => {
              const checked = preferences.productiveTitles.includes(title)
              return (
                <div
                  key={title}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">
                      Stored as a browser preference
                    </p>
                  </div>
                  <Switch
                    checked={checked}
                    aria-label={`Mark ${title} as productive`}
                    onCheckedChange={(nextChecked) => {
                      updatePreferences((current) => ({
                        ...current,
                        productiveTitles: nextChecked
                          ? [...new Set([...current.productiveTitles, title])]
                          : current.productiveTitles.filter(
                              (candidate) => candidate !== title
                            ),
                      }))
                    }}
                  />
                </div>
              )
            })
          ) : (
            <p className="text-xs text-muted-foreground">
              No application labels are available in the last 30 days.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

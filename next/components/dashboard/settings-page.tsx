"use client"

import * as React from "react"
import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"

import { useDashboard } from "@/components/dashboard/dashboard-provider"
import {
  DashboardError,
  DashboardSkeleton,
} from "@/components/dashboard/data-state"
import { PageHeading } from "@/components/dashboard/page-heading"
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
import {
  getApplicationSource,
  getApplicationSourceLabel,
  type ApplicationSource,
} from "@/lib/dashboard/application-source"
import type {
  FontSizePreference,
  SidebarWidthPreference,
} from "@/lib/dashboard/preferences"
import type { ApplicationsData, RangeKey } from "@/lib/dashboard/types"

export function SettingsPage() {
  const { setTheme } = useTheme()
  const { preferences, updatePreferences, setRange } = useDashboard()
  const [applicationSource, setApplicationSource] =
    React.useState<ApplicationSource>("app")
  const applications = useDashboardQuery<ApplicationsData>(
    "/api/applications?range=30d"
  )

  if (applications.isLoading) {
    return <DashboardSkeleton />
  }

  const visibleApplications = applications.data?.items.filter(
    (application) =>
      getApplicationSource(application.appClass) === applicationSource
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
            <CardTitle>Font size</CardTitle>
            <CardDescription>
              Scale text and interface spacing across the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToggleGroup
              value={[preferences.fontSize]}
              onValueChange={(values) => {
                const fontSize = values[0] as FontSizePreference | undefined
                if (fontSize) {
                  updatePreferences({ fontSize })
                }
              }}
              variant="outline"
              spacing={0}
              aria-label="Dashboard font size"
            >
              <ToggleGroupItem value="small">Small</ToggleGroupItem>
              <ToggleGroupItem value="default">Default</ToggleGroupItem>
              <ToggleGroupItem value="large">Large</ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Expanded sidebar width</CardTitle>
            <CardDescription>
              Choose how much horizontal space the open sidebar uses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToggleGroup
              value={[preferences.sidebarWidth]}
              onValueChange={(values) => {
                const sidebarWidth = values[0] as
                  | SidebarWidthPreference
                  | undefined
                if (sidebarWidth) {
                  updatePreferences({ sidebarWidth })
                }
              }}
              variant="outline"
              spacing={0}
              aria-label="Expanded sidebar width"
            >
              <ToggleGroupItem value="narrow">Narrow</ToggleGroupItem>
              <ToggleGroupItem value="default">Default</ToggleGroupItem>
              <ToggleGroupItem value="wide">Wide</ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Productive applications</CardTitle>
          <CardDescription>
            Choose productive labels separately for apps and browser windows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            value={[applicationSource]}
            onValueChange={(values) => {
              const source = values[0] as ApplicationSource | undefined
              if (source) {
                setApplicationSource(source)
              }
            }}
            variant="outline"
            spacing={0}
            aria-label="Application source"
          >
            <ToggleGroupItem value="app">Apps</ToggleGroupItem>
            <ToggleGroupItem value="browser">Browser</ToggleGroupItem>
          </ToggleGroup>

          <div className="mt-4 divide-y">
            {applications.error ? (
              <DashboardError message={applications.error} />
            ) : visibleApplications?.length ? (
              visibleApplications.map((application) => {
                const checked = preferences.productiveTitles.includes(
                  application.windowTitle
                )
                return (
                  <div
                    key={`${application.appClass}-${application.windowTitle}`}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {application.windowTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getApplicationSourceLabel(application.appClass)}
                      </p>
                    </div>
                    <Switch
                      checked={checked}
                      aria-label={`Mark ${application.windowTitle} as productive`}
                      onCheckedChange={(nextChecked) => {
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
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-muted-foreground">
                No {applicationSource === "app" ? "apps" : "browser windows"}{" "}
                are available in the last 30 days.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

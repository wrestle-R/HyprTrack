"use client"

import * as React from "react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useDashboard } from "@/components/dashboard/dashboard-provider"
import {
  DashboardEmpty,
  DashboardError,
  DashboardSkeleton,
} from "@/components/dashboard/data-state"
import { PageHeading } from "@/components/dashboard/page-heading"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  formatDate,
  formatDuration,
  formatTimestamp,
} from "@/lib/dashboard/format"
import type {
  ApplicationUsage,
  ApplicationsData,
} from "@/lib/dashboard/types"

function ApplicationDetails({
  application,
  open,
  onOpenChange,
}: {
  application: ApplicationUsage | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{application?.windowTitle ?? "Application"}</SheetTitle>
          <SheetDescription>
            Usage details derived from normalized HyprTrack samples.
          </SheetDescription>
        </SheetHeader>
        {application ? (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Tracked</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatDuration(application.minutes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Share</p>
                <p className="mt-1 text-xl font-semibold">
                  {application.share}%
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sessions</p>
                <p className="mt-1 text-sm font-medium">
                  {application.sessionCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Class</p>
                <Badge variant="secondary" className="mt-1">
                  {application.appClass}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-y py-4">
              <div>
                <p className="text-xs text-muted-foreground">First seen</p>
                <p className="mt-1 text-xs font-medium">
                  {formatDate(application.firstSeen)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last seen</p>
                <p className="mt-1 text-xs font-medium">
                  {formatTimestamp(application.lastSeen, true)}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold">Recent sessions</h3>
                <p className="text-xs text-muted-foreground">
                  Up to five recent grouped sessions.
                </p>
              </div>
              {application.recentSessions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No sessions in this range.
                </p>
              ) : (
                application.recentSessions.map((session) => (
                  <div
                    key={session.startAt}
                    className="flex items-center justify-between gap-4 border-b pb-3 last:border-b-0"
                  >
                    <div>
                      <p className="text-xs font-medium">
                        {formatTimestamp(session.startAt, true)}
                      </p>
                      <p className="text-[0.65rem] text-muted-foreground">
                        {session.sampleCount} one-minute{" "}
                        {session.sampleCount === 1 ? "sample" : "samples"}
                      </p>
                    </div>
                    <span className="text-xs tabular-nums">
                      {formatDuration(session.durationMinutes)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

export function ApplicationsPage() {
  const { range } = useDashboard()
  const [search, setSearch] = React.useState("")
  const deferredSearch = React.useDeferredValue(search)
  const [selected, setSelected] = React.useState<ApplicationUsage | null>(null)

  const params = new URLSearchParams({ range })
  if (deferredSearch) {
    params.set("search", deferredSearch)
  }
  const query = useDashboardQuery<ApplicationsData>(
    `/api/applications?${params.toString()}`
  )

  if (query.isLoading) {
    return <DashboardSkeleton />
  }
  if (query.error) {
    return <DashboardError message={query.error} />
  }
  if (!query.data) {
    return null
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Applications"
        description="Compare normalized window labels, session counts, and usage share."
        badge={query.isRefreshing ? "Refreshing" : query.data.range.label}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search applications"
          aria-label="Search applications"
          className="h-9 sm:max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          {query.data.items.length} normalized{" "}
          {query.data.items.length === 1 ? "label" : "labels"}
        </p>
      </div>

      {query.data.items.length === 0 ? (
        <DashboardEmpty
          title="No matching applications"
          description="Change the search or choose a wider date range."
        />
      ) : (
        <Card className="shadow-none">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 pl-4">Rank</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Sessions</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="pr-4 text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((application, index) => (
                  <TableRow
                    key={`${application.appClass}-${application.windowTitle}`}
                  >
                    <TableCell className="pl-4 font-mono text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </TableCell>
                    <TableCell className="min-w-56">
                      <p className="max-w-72 truncate font-medium">
                        {application.windowTitle}
                      </p>
                      <div className="mt-2 h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground"
                          style={{ width: `${application.share}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{application.appClass}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {formatDuration(application.minutes)}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {application.share}%
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {application.sessionCount}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {formatTimestamp(application.lastSeen, true)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(application)}
                      >
                        View
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          data-icon="inline-end"
                        />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ApplicationDetails
        application={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
          }
        }}
      />
    </div>
  )
}

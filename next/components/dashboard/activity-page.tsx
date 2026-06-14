"use client"

import * as React from "react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  formatDuration,
  formatTimestamp,
} from "@/lib/dashboard/format"
import type { ActivityData } from "@/lib/dashboard/types"
import { cn } from "@/lib/utils"

export function ActivityPage() {
  const { range, preferences } = useDashboard()
  const [search, setSearch] = React.useState("")
  const deferredSearch = React.useDeferredValue(search)
  const [app, setApp] = React.useState("")
  const filterKey = `${range}\u0000${deferredSearch}\u0000${app}`
  const [pagination, setPagination] = React.useState({
    filterKey,
    page: 1,
  })
  const page =
    pagination.filterKey === filterKey ? pagination.page : 1
  const pageSize = 15

  const setPage = (nextPage: number | ((current: number) => number)) => {
    setPagination((current) => {
      const currentPage =
        current.filterKey === filterKey ? current.page : 1
      return {
        filterKey,
        page:
          typeof nextPage === "function"
            ? nextPage(currentPage)
            : nextPage,
      }
    })
  }

  const params = new URLSearchParams({
    range,
    page: String(page),
    pageSize: String(pageSize),
  })
  if (app) {
    params.set("app", app)
  }
  if (deferredSearch) {
    params.set("search", deferredSearch)
  }
  const query = useDashboardQuery<ActivityData>(
    `/api/activity?${params.toString()}`
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

  const compact = preferences.tableDensity === "compact"

  return (
    <div className="flex flex-col gap-8">
      <PageHeading
        title="Activity"
        description="Inspect grouped focus sessions without exposing full window titles."
        badge={query.isRefreshing ? "Refreshing" : query.data.range.label}
      />

      <Card className="shadow-none">
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search application class or title"
            aria-label="Search activity"
            className="h-9 md:max-w-sm"
          />
          <Select
            value={app || "all"}
            onValueChange={(value) =>
              setApp(!value || value === "all" ? "" : value)
            }
          >
            <SelectTrigger className="h-9 min-w-44" aria-label="Application">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All application classes</SelectItem>
                {query.data.appClasses.map((appClass) => (
                  <SelectItem key={appClass} value={appClass}>
                    {appClass}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="ml-auto text-xs text-muted-foreground">
            {query.data.pagination.totalItems} grouped{" "}
            {query.data.pagination.totalItems === 1 ? "session" : "sessions"}
          </p>
        </CardContent>
      </Card>

      {query.data.sessions.length === 0 ? (
        <DashboardEmpty
          title="No matching sessions"
          description="Change the search, application filter, or date range."
        />
      ) : (
        <Card className="shadow-none">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Window title</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="pr-4 text-right">Intervals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.sessions.map((session) => (
                  <TableRow
                    key={`${session.startAt}-${session.appClass}-${session.windowTitle}`}
                    className={cn(compact && "h-8")}
                  >
                    <TableCell
                      className={cn(
                        "max-w-80 truncate pl-4 font-medium",
                        compact && "py-1"
                      )}
                    >
                      {session.windowTitle}
                    </TableCell>
                    <TableCell className={cn(compact && "py-1")}>
                      <Badge variant="secondary">{session.appClass}</Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-mono text-muted-foreground",
                        compact && "py-1"
                      )}
                    >
                      {formatTimestamp(session.startAt, true)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-mono text-muted-foreground",
                        compact && "py-1"
                      )}
                    >
                      {formatTimestamp(session.endAt)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        compact && "py-1"
                      )}
                    >
                      {formatDuration(session.durationMinutes)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "pr-4 text-right tabular-nums text-muted-foreground",
                        compact && "py-1"
                      )}
                    >
                      {session.sampleCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Page {query.data.pagination.page} of{" "}
          {query.data.pagination.totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} data-icon="inline-start" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= query.data.pagination.totalPages}
            onClick={() =>
              setPage((current) =>
                Math.min(
                  query.data?.pagination.totalPages ?? current,
                  current + 1
                )
              )
            }
          >
            Next
            <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </div>
  )
}

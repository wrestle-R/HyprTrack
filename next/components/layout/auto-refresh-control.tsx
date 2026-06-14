"use client"

import * as React from "react"

import { useDashboard } from "@/components/dashboard/dashboard-provider"
import { Switch } from "@/components/ui/switch"

const AUTO_REFRESH_INTERVAL_MS = 60_000

export function AutoRefreshControl() {
  const { requestRefresh } = useDashboard()
  const [enabled, setEnabled] = React.useState(false)
  const labelId = React.useId()

  React.useEffect(() => {
    if (!enabled) {
      return
    }

    const interval = window.setInterval(
      requestRefresh,
      AUTO_REFRESH_INTERVAL_MS
    )

    return () => window.clearInterval(interval)
  }, [enabled, requestRefresh])

  return (
    <div className="flex h-7 items-center gap-2 rounded-md border border-input bg-transparent px-2 text-xs font-medium whitespace-nowrap">
      <span id={labelId}>
        <span aria-hidden="true" className="hidden md:inline">
          Auto 1m
        </span>
        <span className="sr-only">Refresh dashboard every minute</span>
      </span>
      <Switch
        size="sm"
        checked={enabled}
        onCheckedChange={setEnabled}
        aria-labelledby={labelId}
      />
    </div>
  )
}

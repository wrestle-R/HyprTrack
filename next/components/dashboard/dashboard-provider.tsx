"use client"

import * as React from "react"

import type { RangeKey } from "@/lib/dashboard/types"
import {
  getPreferencesSnapshot,
  getServerPreferencesSnapshot,
  subscribePreferences,
  type DashboardPreferences,
  writePreferences,
} from "@/lib/dashboard/preferences"

type DashboardContextValue = {
  preferences: DashboardPreferences
  updatePreferences: (
    update:
      | Partial<DashboardPreferences>
      | ((current: DashboardPreferences) => DashboardPreferences)
  ) => void
  range: RangeKey
  setRange: (range: RangeKey) => void
  refreshVersion: number
  refreshRequestedAt: Date | null
  requestRefresh: () => void
}

const DashboardContext = React.createContext<DashboardContextValue | null>(null)

export function DashboardProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const preferences = React.useSyncExternalStore(
    subscribePreferences,
    getPreferencesSnapshot,
    getServerPreferencesSnapshot
  )
  const [rangeOverride, setRangeOverride] = React.useState<RangeKey | null>(null)
  const range = rangeOverride ?? preferences.defaultRange
  const [refreshVersion, setRefreshVersion] = React.useState(0)
  const [refreshRequestedAt, setRefreshRequestedAt] =
    React.useState<Date | null>(null)

  const updatePreferences = React.useCallback(
    (
      update:
        | Partial<DashboardPreferences>
        | ((current: DashboardPreferences) => DashboardPreferences)
    ) => {
      const current = getPreferencesSnapshot()
      const next: DashboardPreferences =
        typeof update === "function"
          ? update(current)
          : { ...current, ...update, version: 1 as const }
      writePreferences(next)
    },
    []
  )

  const requestRefresh = React.useCallback(() => {
    setRefreshRequestedAt(new Date())
    setRefreshVersion((version) => version + 1)
  }, [])

  const value = React.useMemo(
    () => ({
      preferences,
      updatePreferences,
      range,
      setRange: setRangeOverride,
      refreshVersion,
      refreshRequestedAt,
      requestRefresh,
    }),
    [
      preferences,
      range,
      refreshVersion,
      refreshRequestedAt,
      requestRefresh,
      updatePreferences,
    ]
  )

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const context = React.useContext(DashboardContext)
  if (!context) {
    throw new Error("useDashboard must be used within DashboardProvider")
  }
  return context
}

"use client"

import * as React from "react"

import { useDashboard } from "@/components/dashboard/dashboard-provider"

type ApiError = {
  error?: {
    code?: string
    message?: string
  }
}

export function useDashboardQuery<T>(url: string) {
  const { refreshVersion } = useDashboard()
  const [state, setState] = React.useState<{
    url: string | null
    refreshVersion: number
    data: T | null
    error: string | null
    updatedAt: Date | null
  }>({
    url: null,
    refreshVersion: -1,
    data: null,
    error: null,
    updatedAt: null,
  })

  React.useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        })
        const body = (await response.json()) as T & ApiError
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? "The dashboard data could not be loaded."
          )
        }
        setState({
          url,
          refreshVersion,
          data: body,
          error: null,
          updatedAt: new Date(),
        })
      } catch (reason) {
        if (controller.signal.aborted) {
          return
        }
        setState((current) => ({
          ...current,
          url,
          refreshVersion,
          error:
            reason instanceof Error
              ? reason.message
              : "The dashboard data could not be loaded.",
        }))
      }
    }

    void load()
    return () => controller.abort()
  }, [url, refreshVersion])

  const isCurrentUrl = state.url === url
  const isCurrentRequest =
    isCurrentUrl && state.refreshVersion === refreshVersion

  return {
    data: isCurrentUrl ? state.data : null,
    error: isCurrentRequest ? state.error : null,
    isLoading: !isCurrentUrl || (state.data === null && state.error === null),
    isRefreshing:
      isCurrentUrl && state.data !== null && !isCurrentRequest,
    updatedAt: isCurrentUrl ? state.updatedAt : null,
  }
}

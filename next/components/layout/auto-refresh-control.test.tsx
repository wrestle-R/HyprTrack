// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AutoRefreshControl } from "@/components/layout/auto-refresh-control"

const requestRefresh = vi.fn()

vi.mock("@/components/dashboard/dashboard-provider", () => ({
  useDashboard: () => ({ requestRefresh }),
}))

describe("AutoRefreshControl", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    requestRefresh.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("refreshes every minute only while enabled", () => {
    render(<AutoRefreshControl />)

    const toggle = screen.getByRole("switch", {
      name: "Refresh dashboard every minute",
    })

    vi.advanceTimersByTime(60_000)
    expect(requestRefresh).not.toHaveBeenCalled()

    fireEvent.click(toggle)
    vi.advanceTimersByTime(60_000)
    expect(requestRefresh).toHaveBeenCalledTimes(1)

    fireEvent.click(toggle)
    vi.advanceTimersByTime(120_000)
    expect(requestRefresh).toHaveBeenCalledTimes(1)
  })
})

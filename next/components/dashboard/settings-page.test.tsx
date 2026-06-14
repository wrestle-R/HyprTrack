// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SettingsPage } from "@/components/dashboard/settings-page"

const useDashboardQuery = vi.fn()

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

vi.mock("@/components/dashboard/dashboard-provider", () => ({
  useDashboard: () => ({
    preferences: {
      theme: "system",
      defaultRange: "today",
      tableDensity: "comfortable",
      productiveTitles: [],
    },
    updatePreferences: vi.fn(),
    setRange: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-dashboard-query", () => ({
  useDashboardQuery: (...args: unknown[]) => useDashboardQuery(...args),
}))

describe("SettingsPage", () => {
  beforeEach(() => {
    useDashboardQuery.mockReturnValue({
      data: { items: [] },
      error: null,
      isLoading: false,
    })
  })

  it("shows user preferences without table density or database health cards", () => {
    render(<SettingsPage />)

    expect(screen.getByText("Appearance")).toBeInTheDocument()
    expect(screen.getByText("Default date range")).toBeInTheDocument()
    expect(screen.getByText("Productive applications")).toBeInTheDocument()
    expect(screen.queryByText("Table density")).not.toBeInTheDocument()
    expect(screen.queryByText("Database health")).not.toBeInTheDocument()
  })
})

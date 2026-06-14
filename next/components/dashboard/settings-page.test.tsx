// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
      fontSize: "default",
      sidebarWidth: "default",
    },
    updatePreferences: vi.fn(),
    setRange: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-dashboard-query", () => ({
  useDashboardQuery: (...args: unknown[]) => useDashboardQuery(...args),
}))

describe("SettingsPage", () => {
  afterEach(cleanup)

  beforeEach(() => {
    useDashboardQuery.mockReturnValue({
      data: {
        items: [
          {
            appClass: "code",
            windowTitle: "VS Code",
            minutes: 10,
            share: 50,
            sessionCount: 1,
            firstSeen: "2026-06-14T10:00:00+05:30",
            lastSeen: "2026-06-14T10:10:00+05:30",
            recentSessions: [],
          },
          {
            appClass: "com.stremio.stremio",
            windowTitle: "Stremio",
            minutes: 5,
            share: 25,
            sessionCount: 1,
            firstSeen: "2026-06-14T11:00:00+05:30",
            lastSeen: "2026-06-14T11:05:00+05:30",
            recentSessions: [],
          },
          {
            appClass: "zen",
            windowTitle: "YouTube",
            minutes: 5,
            share: 25,
            sessionCount: 1,
            firstSeen: "2026-06-14T12:00:00+05:30",
            lastSeen: "2026-06-14T12:05:00+05:30",
            recentSessions: [],
          },
        ],
      },
      error: null,
      isLoading: false,
    })
  })

  it("shows user preferences without table density or database health cards", () => {
    render(<SettingsPage />)

    expect(screen.getByText("Appearance")).toBeInTheDocument()
    expect(screen.getByText("Default date range")).toBeInTheDocument()
    expect(screen.getByText("Font size")).toBeInTheDocument()
    expect(screen.getByText("Expanded sidebar width")).toBeInTheDocument()
    expect(screen.getByText("Productive applications")).toBeInTheDocument()
    expect(screen.queryByText("Table density")).not.toBeInTheDocument()
    expect(screen.queryByText("Database health")).not.toBeInTheDocument()
  })

  it("separates native apps from browser windows", async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    expect(screen.getByText("VS Code")).toBeInTheDocument()
    expect(screen.getByText("Stremio")).toBeInTheDocument()
    expect(screen.queryByText("YouTube")).not.toBeInTheDocument()
    expect(screen.getByText("Application · code")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Browser" }))

    expect(screen.getByText("YouTube")).toBeInTheDocument()
    expect(screen.getByText("Browser window · Zen")).toBeInTheDocument()
    expect(screen.queryByText("VS Code")).not.toBeInTheDocument()
    expect(screen.queryByText("Stremio")).not.toBeInTheDocument()
  })
})

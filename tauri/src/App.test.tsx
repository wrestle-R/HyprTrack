import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts")
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: React.ReactNode
    }) => <div style={{ width: 640, height: 320 }}>{children}</div>,
  }
})

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock.mockImplementation(async (command: string) => {
    switch (command) {
      case "get_health":
        return {
          status: "connected",
          sampleCount: 439,
          latestSampleAt: "2026-06-14T13:37:43.221+05:30",
        }
      case "get_overview":
        return {
          range: {
            key: "today",
            start: "2026-06-14T00:00:00+05:30",
            end: "2026-06-14T13:37:43+05:30",
            label: "Today",
          },
          trackedMinutes: 120,
          averageTrackedMinutes: 30,
          topApplication: {
            windowTitle: "VS Code",
            appClass: "code",
            minutes: 60,
            share: 50,
            sessionCount: 2,
            firstSeen: "2026-06-14T09:00:00+05:30",
            lastSeen: "2026-06-14T10:00:00+05:30",
            recentSessions: [],
          },
          streakDays: 2,
          timeline: [],
          applications: [
            {
              windowTitle: "VS Code",
              appClass: "code",
              minutes: 60,
              share: 50,
              sessionCount: 2,
              firstSeen: "2026-06-14T09:00:00+05:30",
              lastSeen: "2026-06-14T10:00:00+05:30",
              recentSessions: [],
            },
          ],
          recentSessions: [],
          focusQuality: {
            focusedMinutes: 60,
            continuityPercent: 50,
            longestFocusedBlockMinutes: 42,
            averageSessionMinutes: 20,
            contextSwitches: 3,
            switchesPerTrackedHour: 1.5,
          },
          latestSampleAt: "2026-06-14T13:37:43.221+05:30",
        }
      case "get_insights":
        return {
          range: {
            key: "today",
            start: "2026-06-14T00:00:00+05:30",
            end: "2026-06-14T13:37:43+05:30",
            label: "Today",
          },
          comparisons: {
            trackedMinutes: { current: 120, previous: 90, percentChange: 33.33 },
            averageTrackedMinutesPerActiveDay: {
              current: 120,
              previous: 90,
              percentChange: 33.33,
            },
            focusContinuity: { current: 50, previous: 40, percentChange: 25 },
            averageSessionMinutes: {
              current: 20,
              previous: 18,
              percentChange: 11.11,
            },
            switchesPerTrackedHour: {
              current: 1.5,
              previous: 2,
              percentChange: -25,
            },
          },
          rhythm: [],
          dailyTrend: [],
          highlights: {
            peakWorkingWindow: "10:00–11:00",
            strongestFocusDay: "14 Jun",
            mostFragmentedDay: "14 Jun",
            longestFocusedBlockMinutes: 42,
          },
        }
      case "get_activity":
        return {
          range: {
            key: "today",
            start: "2026-06-14T00:00:00+05:30",
            end: "2026-06-14T13:37:43+05:30",
            label: "Today",
          },
          sessions: [],
          appClasses: ["code", "zen"],
          lastHourCoverage: {
            trackedMinutes: 42,
            untrackedMinutes: 18,
            coveragePercent: 70,
            windowStart: "2026-06-14T12:37:43+05:30",
            windowEnd: "2026-06-14T13:37:43+05:30",
          },
          pagination: {
            page: 1,
            pageSize: 15,
            totalItems: 0,
            totalPages: 1,
          },
        }
      case "get_applications":
        return {
          range: {
            key: "today",
            start: "2026-06-14T00:00:00+05:30",
            end: "2026-06-14T13:37:43+05:30",
            label: "Today",
          },
          items: [],
        }
      default:
        return null
    }
  }),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => undefined),
}))

import App from "./App"

describe("App", () => {
  beforeEach(() => {
    invokeMock.mockClear()
    localStorage.clear()
  })

  it("renders the desktop dashboard shell instead of the starter greet screen", async () => {
    render(<App />)

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument()
    const primaryNavigation = screen.getByRole("navigation", {
      name: "Primary navigation",
    })
    expect(
      Array.from(primaryNavigation.querySelectorAll("button")).map(
        (button) => button.textContent
      )
    ).toEqual([
      "Overview",
      "Insights",
      "Applications",
      "Activity",
      "Mappings",
      "Settings",
    ])
    expect(
      screen.getByRole("navigation", { name: "Utility navigation" })
    ).toHaveTextContent("Keybindings")
    expect(screen.getByText("Auto 1m")).toBeInTheDocument()
    expect(screen.getByLabelText("Use dark theme")).toBeInTheDocument()
    expect(screen.queryByText("Recent activity")).not.toBeInTheDocument()
    expect(
      screen.queryByText("Welcome to Tauri + React")
    ).not.toBeInTheDocument()
  })

  it("enables auto refresh by default", async () => {
    render(<App />)

    const autoRefresh = await screen.findByRole("checkbox", {
      name: /refresh dashboard every minute/i,
    })
    expect(autoRefresh).toBeChecked()
  })

  it("replaces overview application usage with focus quality", async () => {
    render(<App />)

    expect(
      await screen.findByRole("heading", { name: "Focus quality" })
    ).toBeInTheDocument()
    expect(screen.getByText("50%")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Application usage" })).not.toBeInTheDocument()
  })

  it("loads the Insights page with the configured focus threshold", async () => {
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Insights" }))

    expect(
      await screen.findByRole("heading", { name: "Weekly rhythm" })
    ).toBeInTheDocument()
    expect(invokeMock).toHaveBeenCalledWith(
      "get_insights",
      expect.objectContaining({
        range: "today",
        focusThresholdMinutes: 25,
      })
    )
  })

  it("uses active-day wording and comparisons for multi-day ranges", async () => {
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "7 days" }))

    expect(await screen.findByText("Average active day")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Insights" }))
    expect(await screen.findByText("Average tracked/day")).toBeInTheDocument()
  })

  it("persists a changed focus threshold and uses it for overview analytics", async () => {
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Settings" }))
    await user.click(screen.getByRole("button", { name: "45m" }))
    await user.click(screen.getByRole("button", { name: "Overview" }))

    expect(invokeMock).toHaveBeenCalledWith(
      "get_overview",
      expect.objectContaining({
        focusThresholdMinutes: 45,
      })
    )
  })

  it("shows collector setup without service action buttons", async () => {
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Settings" }))

    expect(await screen.findByRole("heading", { name: "Collector" })).toBeInTheDocument()
    expect(screen.getByText("~/.local/bin/hyprtrack/collector/hyprtrack-monitor.py")).toBeInTheDocument()
    expect(screen.getByText("~/.local/bin/hyprtrack/collector/hyprtrack.db")).toBeInTheDocument()
    expect(screen.getByText(/hl\.exec_cmd/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Install Service" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Start Service" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Restart Service" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Uninstall Service" })).not.toBeInTheDocument()
    expect(invokeMock).not.toHaveBeenCalledWith("get_tracking_service_status")
  })

  it("shows an inline loader while productive applications are unavailable", async () => {
    const user = userEvent.setup()
    const defaultImplementation = invokeMock.getMockImplementation()!
    const pendingApplications = new Promise(() => undefined)
    invokeMock.mockImplementation((command: string, args?: unknown) =>
      command === "get_applications"
        ? pendingApplications
        : defaultImplementation(command, args)
    )

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Settings" }))

    expect(screen.getByRole("status")).toHaveTextContent("Loading applications")
    invokeMock.mockImplementation(defaultImplementation)
  })

  it("renders the last hour coverage box on the activity page", async () => {
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Activity" }))

    expect(await screen.findByText("Last 60 minutes")).toBeInTheDocument()
    expect(screen.getByText("42 minutes tracked")).toBeInTheDocument()
    expect(screen.getByText("18 minutes untracked")).toBeInTheDocument()
  })

  it("validates new mappings before allowing them to be saved", async () => {
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Mappings" }))
    await user.click(
      screen.getByRole("button", {
        name: "Add mapping",
      })
    )

    expect(screen.getByText("Match text is required.")).toBeInTheDocument()
    expect(screen.getByText("Display label is required.")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Save mappings" })
    ).toBeDisabled()
  })

  it("runs configured shortcuts only inside the app window", async () => {
    const user = userEvent.setup()

    render(<App />)
    await screen.findByRole("heading", { name: "Overview" })
    await user.keyboard("{Control>}{Alt>}2{/Alt}{/Control}")

    expect(
      await screen.findAllByRole("heading", { name: "Applications" })
    ).not.toHaveLength(0)
  })

  it("returns the content viewport to the top when changing pages", async () => {
    const user = userEvent.setup()

    const { container } = render(<App />)
    await screen.findByRole("heading", { name: "Overview" })
    const content = container.querySelector<HTMLElement>(".content-area")
    expect(content).not.toBeNull()
    if (!content) return
    content.scrollTop = 240

    await user.click(screen.getByRole("button", { name: "Mappings" }))

    expect(content.scrollTop).toBe(0)
  })
})

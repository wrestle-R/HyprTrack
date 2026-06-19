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
          applications: [],
          recentSessions: [],
          latestSampleAt: "2026-06-14T13:37:43.221+05:30",
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
    ).toEqual(["Overview", "Applications", "Activity", "Mappings", "Settings"])
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

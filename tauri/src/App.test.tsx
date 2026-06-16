import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const invokeMock = vi.hoisted(() => vi.fn())
const serviceStatus = vi.hoisted(() => ({
  state: "running",
  dbPath: "/home/test/.local/share/com.hyprtrack.desktop/hyprtrack.db",
  latestSampleAt: "2026-06-14T13:37:43.221+05:30",
  pid: 42 as number | null,
  message: "Tracking service is running.",
  lastError: null,
  journalExcerpt: [],
  installed: true,
  enabled: true,
}))

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
      case "get_tracking_service_status":
        return { ...serviceStatus }
      case "install_tracking_service":
      case "start_tracking_service":
      case "restart_tracking_service":
      case "uninstall_tracking_service":
        return { ...serviceStatus, state: "running", message: "Tracking service is running." }
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
    serviceStatus.state = "running"
    serviceStatus.message = "Tracking service is running."
    serviceStatus.lastError = null
    serviceStatus.installed = true
    serviceStatus.enabled = true
  })

  it("renders the desktop dashboard shell instead of the starter greet screen", async () => {
    render(<App />)

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Applications" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByText("Auto 1m")).toBeInTheDocument()
    expect(screen.getByLabelText("Use dark theme")).toBeInTheDocument()
    expect(
      screen.queryByText("Welcome to Tauri + React")
    ).not.toBeInTheDocument()
  })

  it("shows a warning banner and keeps historical data visible when service is stopped", async () => {
    serviceStatus.state = "stopped"
    serviceStatus.message = "Tracking service is stopped."
    serviceStatus.pid = null

    render(<App />)

    expect(await screen.findByText("Tracking service is stopped.")).toBeInTheDocument()
    expect(await screen.findByText("Tracked time")).toBeInTheDocument()
    expect(await screen.findByText("2h")).toBeInTheDocument()
  })

  it("calls the start service command from settings", async () => {
    const user = userEvent.setup()
    serviceStatus.state = "stopped"
    serviceStatus.message = "Tracking service is stopped."

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Settings" }))
    await user.click(await screen.findByRole("button", { name: "Start Service" }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("start_tracking_service")
    })
  })

  it("renders the last hour coverage box on the activity page", async () => {
    const user = userEvent.setup()

    render(<App />)
    await user.click(await screen.findByRole("button", { name: "Activity" }))

    expect(await screen.findByText("Last 60 minutes")).toBeInTheDocument()
    expect(screen.getByText("42 minutes tracked")).toBeInTheDocument()
    expect(screen.getByText("18 minutes untracked")).toBeInTheDocument()
  })
})
